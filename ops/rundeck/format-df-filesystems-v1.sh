#!/usr/bin/env bash
# Pure formatter for existing Rundeck SPHERE-INFRA-FS-V1 section.
# The caller passes a SINGLE original GNU df -PkT sample on stdin, with the
# same filesystem filters previously used by the Rundeck job. Emit all rows
# (not just report-mapped mounts), preserving the old six positional values
# and appending only source-observed df Available as a named field.
# No files, network, SAP, DB, or Rundeck API are modified.
set -Eeuo pipefail

LC_ALL=C awk '
function invalid(reason) {
  print "SPHERE_FS_FORMAT_ERROR=" reason > "/dev/stderr"
  bad = 1
}
NR == 1 {
  if (NF != 8 || $1 != "Filesystem" || $2 != "Type" ||
      ($3 != "1024-blocks" && $3 != "1K-blocks") ||
      $4 != "Used" || $5 != "Available" ||
      $6 != "Capacity" || $7 != "Mounted" || $8 != "on") {
    invalid("UNEXPECTED_DF_HEADER")
  }
  next
}
{
  if (NF != 7 || $3 !~ /^[0-9]+$/ || $4 !~ /^[0-9]+$/ ||
      $5 !~ /^[0-9]+$/ || $6 !~ /^[0-9]+%$/ ||
      $7 !~ /^\//) {
    invalid("INVALID_DF_ROW_LINE_" NR)
    next
  }
  if (($4 + 0) > ($3 + 0)) {
    invalid("USED_EXCEEDS_SIZE_LINE_" NR)
    next
  }
  pct = $6
  sub(/%$/, "", pct)
  lines[++count] = sprintf("filesystem\t%s\t%s\t%s\t%s\t%s\t%s\tavail_kb=%s",
    $1, $2, $3, $4, pct, $7, $5)
}
END {
  if (NR < 2 || count == 0) invalid("EMPTY_DF_SAMPLE")
  # Fail atomically: do not emit a partial filesystem section if one row
  # was invalid, as partial records could masquerade as a complete sample.
  if (bad) exit 2
  for (i = 1; i <= count; ++i) print lines[i]
}
'
