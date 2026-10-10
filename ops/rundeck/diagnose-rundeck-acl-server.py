#!/usr/bin/env python3
"""Read-only, non-secret inventory of local Rundeck ACL candidates on tbssvr-ssl.

This is NOT an effective ACL evaluator. Stored policies, directory-backed roles,
negative rules and token-specific roles still require an admin review. Never
print file contents, tokens, realm password hashes, logs or environment files.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

USER = "sphere_runner"
IDS = {
    "PERFORMANCE": "4f129041-956c-4e80-916f-fcde8948db09",
    "AVAILABILITY": "34821afe-9261-4122-88db-cf6e8fc65545",
}
BASES = [Path("/etc/rundeck"), Path("/home/rundeck/etc"), Path("/var/lib/rundeck/etc")]
MAX_SIZE = 1024 * 1024

def marker(enabled: bool) -> str:
    return "YES" if enabled else "NO"

def exists_account(kind: str) -> bool:
    try:
        proc = subprocess.run(
            ["getent", kind, USER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=3, check=False,
        )
        return proc.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False

def actions(value) -> set[str]:
    if isinstance(value, list):
        return set(map(str, value))
    if isinstance(value, str):
        return {value}
    return set()

def subject_matches(doc: dict) -> bool:
    by = doc.get("by") or {}
    if not isinstance(by, dict):
        return False
    for key in ("username", "group", "urn"):
        value = by.get(key, [])
        values = value if isinstance(value, list) else [value]
        for raw in values:
            if not isinstance(raw, str):
                continue
            if key == "urn" and raw in (f"user:{USER}", f"group:{USER}"):
                return True
            if key in ("username", "group"):
                try:
                    if re.fullmatch(raw, USER):
                        return True
                except re.error:
                    continue
    return False

def local_files() -> list[Path]:
    found: dict[str, Path] = {}
    for base in BASES:
        if base.is_dir():
            for path in base.glob("*.aclpolicy"):
                if path.is_file() and not path.is_symlink():
                    found[str(path)] = path
    return list(sorted(found.values(), key=str))

def main() -> None:
    print("=== RUNDECK ACL INVENTORY (READ ONLY) ===")
    print("NO TOKENS | NO SERVICE RESTART | NO ACL MUTATION | NO JOB ACTION")
    print("LOCAL_UNIX_USER=" + marker(exists_account("passwd")))
    print("LOCAL_UNIX_GROUP=" + marker(exists_account("group")))
    realm = Path("/etc/rundeck/realm.properties")
    realm_found = False
    try:
        if realm.is_file() and realm.stat().st_size <= MAX_SIZE:
            realm_found = any(
                bool(re.match(r"\\s*" + re.escape(USER) + r"\\s*[:=]", line))
                for line in realm.read_text(errors="replace").splitlines()
            )
    except OSError:
        pass
    print("LOCAL_REALM_ENTRY=" + marker(realm_found) + " (not an LDAP/SSO identity check)")
    paths = local_files()
    print("FILESYSTEM_ACL_COUNT=" + str(len(paths)))
    for path in paths:
        # Filename only, never ACL bodies or secrets.
        print("ACL_FILE=" + str(path))
    try:
        import yaml
    except ImportError:
        print("YAML_PARSER=UNAVAILABLE (install nothing; inspect through authorized Rundeck admin)")
        print("STORED_SYSTEM_PROJECT_ACL=UNVERIFIED (database-backed policies not in this inventory)")
        print("EFFECTIVE_JOB_ACL=UNVERIFIED")
        return
    print("YAML_PARSER=AVAILABLE")
    subjects = 0
    matching_job_ids: set[str] = set()
    broad_job_rules = 0
    project_read_rules = 0
    forbidden_actions: set[str] = set()
    parse_errors = 0
    job_actions: dict[str, set[str]] = {key: set() for key in IDS}
    for path in paths:
        try:
            if path.stat().st_size > MAX_SIZE:
                print("ACL_SKIPPED_OVERSIZE=" + str(path))
                continue
            documents = list(yaml.safe_load_all(path.read_text(errors="replace")))
        except (OSError, yaml.YAMLError):
            parse_errors += 1
            continue
        for doc in documents:
            if not isinstance(doc, dict) or not subject_matches(doc):
                continue
            subjects += 1
            context = doc.get("context") or {}
            rules = doc.get("for") or {}
            if not isinstance(context, dict) or not isinstance(rules, dict):
                continue
            if context.get("application") == "rundeck":
                for rule in rules.get("project", []):
                    if isinstance(rule, dict) and "read" in actions(rule.get("allow")):
                        project_read_rules += 1
            if "project" not in context:
                continue
            for rule in rules.get("job", []):
                if not isinstance(rule, dict):
                    continue
                allowed = actions(rule.get("allow"))
                forbidden_actions |= allowed.intersection({
                    "admin", "delete", "update", "create", "runAs", "killAs", "*"
                })
                equals = rule.get("equals") or {}
                uuid = equals.get("uuid") if isinstance(equals, dict) else None
                matched = [key for key, value in IDS.items() if uuid == value]
                if matched:
                    for key in matched:
                        matching_job_ids.add(key)
                        job_actions[key].update(allowed)
                else:
                    broad_job_rules += 1
    print("LOCAL_SUBJECT_MATCH_DOCS=" + str(subjects))
    print("APPLICATION_PROJECT_READ_RULES=" + str(project_read_rules))
    print("JOB_RULE_PERF_EXACT_UUID=" + marker("PERFORMANCE" in matching_job_ids))
    print("JOB_RULE_AVAIL_EXACT_UUID=" + marker("AVAILABILITY" in matching_job_ids))
    for name in IDS:
        print(name + "_ACTIONS=" + ",".join(sorted(job_actions[name])) if job_actions[name] else name + "_ACTIONS=UNVERIFIED")
    print("NON_UUID_JOB_RULES=" + str(broad_job_rules) + " (requires scope review)")
    print("EXCESSIVE_JOB_ACTIONS_SEEN=" + (",".join(sorted(forbidden_actions)) or "NONE_IN_MATCHED_LOCAL_DOCS"))
    print("YAML_PARSE_ERRORS=" + str(parse_errors))
    print("STORED_SYSTEM_PROJECT_ACL=UNVERIFIED (check Rundeck Access Control GUI)")
    print("TOKEN_EFFECTIVE_ROLES=UNVERIFIED (check token owner and assigned roles)")
    print("EFFECTIVE_RUN_KILL=NOT_TESTED (static inventory cannot prove authorization)")
    print("NO_CHANGES=YES")

if __name__ == "__main__":
    main()
