import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.rundeck_infra_parser import parse
from backend.rundeck_infra_poller import _group_output_entries, _stored_execution_hosts
from backend.rundeck_infra_store import identifier
from backend.rundeck_infra_api import monthly_storage_evidence, _storage_used_bytes

POSITIONAL_SAMPLE=b"""## SPHERE-INFRA-V1-BEGIN
snapshot_ts=2026-09-23T18:15:37+07:00
hostname=AOPH1QAPPDC
sample_seconds=5
## SPHERE-INFRA-FS-V1-BEGIN
filesystem /dev/mapper/os_vg-root_lv btrfs 52428800 39826428 79 /
filesystem /dev/mapper/os_vg-root_lv btrfs 52428800 39826428 79 /home
filesystem /dev/mapper/data_vg1-intf xfs 104857600 33554432 68 /INTF
## SPHERE-INFRA-FS-V1-END
## SPHERE-INFRA-NET-V1-BEGIN
network eth0 rx_mbps=0.970 tx_mbps=0.462 rx_dropped_delta=0 tx_dropped_delta=0
## SPHERE-INFRA-NET-V1-END
## SPHERE-INFRA-DISK-V1-BEGIN
disk dm-0 write_iops=18.6 write_mbps=0.195 util_pct=3.84
disk dm-3 util_pct=0
## SPHERE-INFRA-DISK-V1-END
## SPHERE-INFRA-DISKMAP-V1-BEGIN
diskmap dm-0 /
diskmap dm-0 /var
diskmap dm-3 /INTF
## SPHERE-INFRA-DISKMAP-V1-END
## SPHERE-INFRA-V1-END
"""

SAMPLE=b"""## SPHERE-INFRA-V1-BEGIN
snapshot_ts=2026-09-23T10:00:00Z
hostname=AOPH1QAPPDC
sample_seconds=5
## SPHERE-INFRA-FS-V1-BEGIN
device=/dev/mapper/os_vg-root_lv mount=/ used_pct=79
device=/dev/mapper/os_vg-root_lv mount=/home used_pct=79
device=/dev/mapper/data_vg1-intf mount=/INTF used_pct=68
## SPHERE-INFRA-FS-V1-END
## SPHERE-INFRA-NET-V1-BEGIN
interface=eth0 rx_mbps=0.970 tx_mbps=0.462 rx_dropped_delta=0 tx_dropped_delta=0
## SPHERE-INFRA-NET-V1-END
## SPHERE-INFRA-DISK-V1-BEGIN
disk=dm-0 write_iops=18.6 write_mbps=0.195 util_pct=3.84
disk=dm-3 util_pct=0
## SPHERE-INFRA-DISK-V1-END
## SPHERE-INFRA-DISKMAP-V1-BEGIN
disk=dm-0 mount=/
disk=dm-3 mount=/INTF
## SPHERE-INFRA-DISKMAP-V1-END
## SPHERE-INFRA-V1-END
"""

class InfraParserTests(unittest.TestCase):
    def test_parse_contract_and_dedupe(self):
        result=parse(SAMPLE)
        self.assertEqual(result["hostname"],"AOPH1QAPPDC")
        roots=[row for row in result["filesystems"] if row["device"]=="/dev/mapper/os_vg-root_lv"]
        self.assertEqual(sum(1 for row in roots if row["is_primary"]),1)
        self.assertTrue(next(row for row in roots if row["mount"]=="/")["is_primary"])
    def test_real_positional_filesystem_contract(self):
        result=parse(POSITIONAL_SAMPLE)
        root=next(row for row in result["filesystems"] if row["mount"]=="/")
        self.assertEqual(root["device"],"/dev/mapper/os_vg-root_lv")
        self.assertEqual(root["fstype"],"btrfs")
        self.assertEqual(root["used_pct"],79.0)
        self.assertEqual(root["total_bytes"],52428800*1024)
        self.assertEqual(root["avail_bytes"],(52428800-39826428)*1024)
        self.assertTrue(root["is_primary"])

    def test_positional_network_identity(self):
        result=parse(POSITIONAL_SAMPLE)
        self.assertEqual(result["network"][0]["interface"],"eth0")
        self.assertEqual(result["network"][0]["rx_dropped_delta"],"0")

    def test_positional_storage_identity_and_diskmap(self):
        result=parse(POSITIONAL_SAMPLE)
        self.assertEqual([row["disk"] for row in result["storage"]],["dm-0","dm-3"])
        self.assertEqual(next(row for row in result["storage"] if row["disk"]=="dm-0")["mount"],"/")
        self.assertEqual(next(row for row in result["storage"] if row["disk"]=="dm-3")["mount"],"/INTF")

    def test_diskmap_uses_mount_labels(self):
        result=parse(SAMPLE)
        self.assertEqual(next(row for row in result["storage"] if row["disk"]=="dm-3")["mount"],"/INTF")
    def test_network_delta_preserved(self):
        result=parse(SAMPLE)
        self.assertEqual(result["network"][0]["rx_dropped_delta"],"0")

class InfraMultiHostPollerTests(unittest.TestCase):
    def test_groups_rundeck_output_by_node(self):
        payload={"completed":True,"execCompleted":True,"entries":[
            {"node":"AOPH1PAPPDC","log":"## SPHERE-INFRA-V1-BEGIN"},
            {"node":"AOPH2PAPPDC","log":"## SPHERE-INFRA-V1-BEGIN"},
            {"node":"AOPH1PAPPDC","log":"hostname=AOPH1PAPPDC"},
            {"node":"AOPH2PAPPDC","log":"hostname=AOPH2PAPPDC"},
        ]}
        grouped=_group_output_entries(payload,["AOPH1PAPPDC","AOPH2PAPPDC"])
        self.assertIn(b"hostname=AOPH1PAPPDC",grouped["AOPH1PAPPDC"])
        self.assertIn(b"hostname=AOPH2PAPPDC",grouped["AOPH2PAPPDC"])

    def test_multi_node_group_requires_all_hosts(self):
        payload={"completed":True,"execCompleted":True,"entries":[{"node":"AOPH1PAPPDC","log":"x"}]}
        with self.assertRaisesRegex(ValueError,"AOPH2PAPPDC"):
            _group_output_entries(payload,["AOPH1PAPPDC","AOPH2PAPPDC"])

class InfraManifestFastPathTests(unittest.TestCase):
    def _manifest(self, root: Path, eid: str, host: str, *,
                  multi: bool, status: str = "STORED",
                  recorded_execution: str | None = None,
                  recorded_host: str | None = None):
        cid = identifier(eid, host if multi else None)
        path = root / "manifests" / f"{cid}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "collection_id": cid,
            "execution_id": recorded_execution or eid,
            "host": recorded_host or host,
            "database_status": status,
        }))
        return path

    def test_reads_only_matching_single_host_execution(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._manifest(root, "1234", "AOPH1QAPPDC", multi=False)
            # Historical broken manifest must not be scanned or decoded.
            (root / "manifests" / "infra-rundeck-1000.json").write_text("{corrupt")
            with patch("backend.rundeck_infra_poller.ROOT", root):
                self.assertEqual(
                    _stored_execution_hosts("1234", ["AOPH1QAPPDC"]),
                    {"AOPH1QAPPDC"},
                )
                self.assertEqual(
                    _stored_execution_hosts("1235", ["AOPH1QAPPDC"]),
                    set(),
                )

    def test_multi_host_requires_each_matching_stored_manifest(self):
        hosts = ["AOPH1PAPPDC", "AOPH2PAPPDC", "AOPH3PAPPDC"]
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._manifest(root, "2345", hosts[0], multi=True)
            self._manifest(root, "2345", hosts[1], multi=True, status="ERROR")
            self._manifest(root, "2345", hosts[2], multi=True, recorded_host="OTHER")
            with patch("backend.rundeck_infra_poller.ROOT", root):
                self.assertEqual(_stored_execution_hosts("2345", hosts), {hosts[0]})
            self._manifest(root, "2345", hosts[1], multi=True)
            self._manifest(root, "2345", hosts[2], multi=True)
            with patch("backend.rundeck_infra_poller.ROOT", root):
                self.assertEqual(_stored_execution_hosts("2345", hosts), set(hosts))

    def test_current_corrupt_manifest_fails_closed(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            path=self._manifest(root, "3456", "AOPH1QAPPDC", multi=False)
            path.write_text("{malformed")
            with patch("backend.rundeck_infra_poller.ROOT", root):
                with self.assertRaises(json.JSONDecodeError):
                    _stored_execution_hosts("3456", ["AOPH1QAPPDC"])




class MonthlyStorageHistoryTests(unittest.TestCase):
    def test_actual_df_used_kb_is_not_total_minus_free(self):
        self.assertEqual(_storage_used_bytes({"details":{"_positional":[
            "filesystem","/dev/root","xfs","1000","620","62","/"]}}),620*1024)

    def test_missing_month_samples_never_report_zero(self):
        class Result:
            def mappings(self): return self
            def all(self): return []
        class Conn:
            def execute(self, sql, params): return Result()
        res=monthly_storage_evidence("2026-09",Conn(),{
            "File System OS":{"host":"AOPH1PAPPDC","mount":"/"}})
        self.assertTrue(all(row["status"]=="NOT_COLLECTED" for row in res["items"]))
        self.assertTrue(all(row["used_bytes"] is None for row in res["items"]))

    def test_latest_historical_sample_selected_for_mapped_host_mount(self):
        from datetime import datetime, timezone
        def record(day,used):
            return {"host":"AOPH1PAPPDC","mount_point":"/",
              "collected_at":datetime(2026,9,day,tzinfo=timezone.utc),
              "details":{"_positional":["filesystem","/dev/root","xfs","1000",str(used),"60","/"]},
              "total_bytes":1000*1024,"avail_bytes":(1000-used)*1024,"used_pct":60}
        class Result:
            def mappings(self): return self
            def all(self): return [record(26,600),record(22,500)]
        class Conn:
            def execute(self, sql, params): return Result()
        res=monthly_storage_evidence("2026-09",Conn(),{
            "File System OS":{"host":"AOPH1PAPPDC","mount":"/"}})
        self.assertEqual(res["items"][0]["used_bytes"],600*1024)
        self.assertEqual(res["items"][0]["status"],"COLLECTED")
