import unittest
from backend.rundeck_infra_parser import parse

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
    def test_diskmap_uses_mount_labels(self):
        result=parse(SAMPLE)
        self.assertEqual(next(row for row in result["storage"] if row["disk"]=="dm-3")["mount"],"/INTF")
    def test_network_delta_preserved(self):
        result=parse(SAMPLE)
        self.assertEqual(result["network"][0]["rx_dropped_delta"],"0")
