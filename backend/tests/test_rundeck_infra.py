import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from backend.rundeck_infra_parser import parse
from backend.rundeck_infra_poller import _group_output_entries, _stored_execution_hosts
from backend.rundeck_infra_store import identifier
from backend.rundeck_infra_api import monthly_storage_evidence, _storage_used_bytes, _storage_explicit_available_bytes

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

    def test_explicit_df_avail_kb_wins_over_legacy_total_minus_used(self):
        # 1K-blocks reported by df -Pk: 200 free instead of the derived 380.
        # Do not silently present reserved filesystem blocks as df Avail.
        raw = POSITIONAL_SAMPLE.replace(
            b"filesystem /dev/mapper/data_vg1-intf xfs 104857600 33554432 68 /INTF",
            b"filesystem /dev/mapper/data_vg1-intf xfs 104857600 33554432 68 /INTF avail_kb=200"
        )
        fs = next(row for row in parse(raw)["filesystems"] if row["mount"] == "/INTF")
        self.assertEqual(fs["avail_bytes"], 200 * 1024)
        self.assertEqual(fs["details"]["avail_kb"], "200")
        self.assertEqual(_storage_explicit_available_bytes({"details": fs["details"]}), 200 * 1024)

    def test_legacy_missing_df_avail_remains_unverified_in_reporting(self):
        fs = next(row for row in parse(POSITIONAL_SAMPLE)["filesystems"] if row["mount"] == "/")
        self.assertGreater(fs["avail_bytes"], 0)  # Existing legacy estimated column unchanged
        self.assertIsNone(_storage_explicit_available_bytes({"details": fs["details"]}))

    def test_actual_app1_archive_format_backward_compatible_with_df_avail(self):
        # Confirmed APP1 sample: 6 Nov audit of archived 1 Nov execution.
        lines = [
            "filesystem /dev/mapper/os_vg-os_lv btrfs 83886080 63048892 76 /",
            "filesystem /dev/mapper/SAPARCH-SAPARCH xfs 1649922052 1038484488 63 /SAP_ARCH",
            "filesystem /dev/mapper/ArchiveINTF-ArchiveINTF xfs 752609284 413036372 55 /ArchiveINTF",
            "filesystem /dev/mapper/intf_vg-intf_lv xfs 838742020 674006816 81 /INTF",
        ]
        def envelope(rows):
            return chr(10).join([
                "## SPHERE-INFRA-V1-BEGIN",
                "snapshot_ts=2026-11-01T16:58:45Z",
                "hostname=AOPH1PAPPDC",
                "sample_seconds=5",
                "## SPHERE-INFRA-FS-V1-BEGIN",
                *rows,
                "## SPHERE-INFRA-FS-V1-END",
                "## SPHERE-INFRA-NET-V1-BEGIN",
                "network eth0 rx_mbps=0 tx_mbps=0",
                "## SPHERE-INFRA-NET-V1-END",
                "## SPHERE-INFRA-DISK-V1-BEGIN",
                "disk dm-0 util_pct=0",
                "## SPHERE-INFRA-DISK-V1-END",
                "## SPHERE-INFRA-DISKMAP-V1-BEGIN",
                "diskmap dm-0 /",
                "## SPHERE-INFRA-DISKMAP-V1-END",
                "## SPHERE-INFRA-V1-END",
            ])
        mounts = ("/", "/SAP_ARCH", "/ArchiveINTF", "/INTF")
        legacy = parse(envelope(lines))
        for mount in mounts:
            fs = next(row for row in legacy["filesystems"] if row["mount"] == mount)
            self.assertIsNone(_storage_explicit_available_bytes({"details": fs["details"]}))
        # Future-format synthetic values are for a parser test, not actual df data.
        future = parse(envelope([line + " avail_kb=2097152" for line in lines]))
        for mount in mounts:
            fs = next(row for row in future["filesystems"] if row["mount"] == mount)
            self.assertEqual(fs["avail_bytes"], 2097152 * 1024)
            self.assertEqual(_storage_explicit_available_bytes({"details": fs["details"]}), 2097152 * 1024)

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

    def test_legacy_positional_contract_never_invents_df_available(self):
        legacy={"details":{"_positional":["filesystem","/dev/root","xfs","1000","620","64","/"]},
                "avail_bytes":380*1024}
        self.assertIsNone(_storage_explicit_available_bytes(legacy))
        self.assertEqual(_storage_used_bytes(legacy),620*1024)
        self.assertEqual(_storage_explicit_available_bytes(
            {"details":{"avail_bytes":"250000"}}),250000)
        self.assertEqual(_storage_explicit_available_bytes(
            {"details":{"avail_kb":"250"}}),250*1024)
        self.assertIsNone(_storage_explicit_available_bytes(
            {"details":{"avail_bytes":"invalid"}}))

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
        self.assertEqual(res["source_rows"],0)
        self.assertEqual(res["configured_categories"],1)
        self.assertEqual(res["items"][0]["reason"],"NO_MONTHLY_INFRA_HISTORY")
        self.assertEqual(res["items"][1]["reason"],"MAPPING_NOT_CONFIGURED")

    def test_latest_historical_sample_selected_for_mapped_host_mount(self):
        from datetime import datetime, timezone
        def record(day,used):
            return {"host":"AOPH1PAPPDC","mount_point":"/",
              "collected_at":datetime(2026,9,day,tzinfo=timezone.utc),
              "details":{"_positional":["filesystem","/dev/root","xfs","1000",str(used),"60","/"]},
              "total_bytes":1000*1024,"avail_bytes":(1000-used)*1024,"used_pct":60,
              "source_rows":2}
        class Result:
            def mappings(self): return self
            def all(self): return [record(26,600)]
        class Conn:
            def execute(self, sql, params):
                self.query = str(sql)
                return Result()
        conn = Conn()
        res=monthly_storage_evidence("2026-09",conn,{
            "File System OS":{"host":"AOPH1PAPPDC","mount":"/"}})
        self.assertEqual(res["items"][0]["used_bytes"],600*1024)
        self.assertEqual(res["items"][0]["status"],"COLLECTED")
        self.assertIsNone(res["items"][0]["reason"])
        self.assertIsNone(res["items"][0]["free_bytes"])
        self.assertEqual(res["items"][0]["availability_source"],"NOT_RETAINED")
        self.assertEqual(res["items"][0]["used_pct"],60)
        self.assertEqual(res["source_rows"],2)
        self.assertEqual(res["distinct_mounts"],1)
        self.assertIn("DISTINCT ON (UPPER(f.host), f.mount_point)", conn.query)
        self.assertIn("COUNT(*) OVER () AS source_rows", conn.query)
        # Even though SQL returns only the newest row, the total source
        # samples still reflect all records before DISTINCT ON.
        self.assertEqual(res["source_rows"], 2)


    def test_explicit_df_available_is_preserved_without_recomputing_use_percent(self):
        from datetime import datetime, timezone
        class Result:
            def mappings(self): return self
            def all(self):
                return [{
                    "host":"AOPH1PAPPDC","mount_point":"/",
                    "collected_at":datetime(2026,10,20,tzinfo=timezone.utc),
                    "details":{"_positional":["filesystem","/dev/root","xfs","1000","620","76","/"],
                               "avail_bytes":"350000"},
                    "total_bytes":1000*1024,"avail_bytes":380*1024,
                    "used_pct":76,"source_rows":1,
                }]
        class Conn:
            def execute(self,sql,params): return Result()
        row=monthly_storage_evidence("2026-10",Conn(),{
            "File System OS":{"host":"AOPH1PAPPDC","mount":"/"}})["items"][0]
        self.assertEqual(row["status"],"COLLECTED")
        self.assertEqual(row["used_bytes"],620*1024)
        self.assertEqual(row["free_bytes"],350000)
        self.assertEqual(row["availability_source"],"EXPLICIT")
        self.assertEqual(row["used_pct"],76)

    def test_missing_mapping_does_not_fall_back_to_any_mount(self):
        from datetime import datetime, timezone
        class Result:
            def mappings(self): return self
            def all(self):
                return [{"host":"AOPH1PAPPDC","mount_point":"/",
                    "collected_at":datetime(2026,10,20,tzinfo=timezone.utc),
                    "details":{"_positional":["filesystem","/dev/root","xfs","1000","600","60","/"]},
                    "total_bytes":1000*1024,"avail_bytes":400*1024,"used_pct":60,
                    "source_rows":1}]
        class Conn:
            def execute(self, sql, params):return Result()
        result=monthly_storage_evidence("2026-10",Conn(),{})
        self.assertEqual(result["configured_categories"],0)
        self.assertEqual(result["source_rows"],1)
        self.assertTrue(all(row["reason"]=="MAPPING_NOT_CONFIGURED" for row in result["items"]))
        self.assertTrue(all(row["used_pct"] is None for row in result["items"]))
