#!/usr/bin/env bash
# Banzami Environment Blueprint — VM execution adapter · resource classifier (pure library).
#
# This file contains NO transport, NO SSH, NO target, NO secret. It is the safety-critical
# heart of the legacy reset: given a Docker resource inventory (TSV), it partitions every
# resource into exactly one of:
#
#   IN        — authorised Banzami/BANZA/BanzAI teardown scope (family-affiliated)
#   EXCLUDED  — NOT deleted (reason UNRELATED or AMBIGUOUS)
#
# Fail-closed rule: a resource is deleted ONLY if it is positively affiliated with the
# Banzami/BANZA/BanzAI family (the token "banza" is a substring of banza, banzami AND banzai)
# via its name, compose project, image, network or labels. Anything NOT positively affiliated
# is EXCLUDED — never deleted — so an unrelated or ambiguous third-party workload is preserved
# by default. The delete plan is generated ONLY from IN rows, one scoped command per resource;
# no prune, no unscoped deletion can ever be emitted.
#
# Sourced by both the orchestrator (real remote inventory) and the local test harness
# (synthetic fixture) so the dangerous logic is validated offline before any VM contact.

# TSV inventory columns (tab-separated), one resource per line:
#   1 kind      container|image|volume|network
#   2 id        docker id (or image ref)
#   3 name      resource name (container name / image repo:tag / volume / network)
#   4 project   com.docker.compose.project label, or "-"
#   5 image     image ref for containers, or "-"
#   6 extra     attached networks + relevant labels, comma-joined, or "-"

# classify_inventory <infile> <out_manifest> <out_excluded>
classify_inventory() {
  local infile="$1" manifest="$2" excluded="$3"
  : > "$manifest"; : > "$excluded"
  awk -F'\t' -v MAN="$manifest" -v EXC="$excluded" '
    function low(s){ return tolower(s) }
    NF>=3 {
      kind=$1; id=$2; name=$3; proj=$4; img=$5; extra=$6
      hay=low(name" "proj" "img" "extra)
      # Positive family affiliation → authorised teardown scope.
      if (hay ~ /banza/) { print kind"\t"id"\t"name"\tIN\tbanza-family" >> MAN; next }
      # Explicitly-marked non-Banzami third-party workload → excluded (reported UNRELATED).
      if (hay ~ /thirdparty|third-party|unrelated|otherapp|external-app|com\.example|notbanza/) {
        print kind"\t"id"\t"name"\tEXCLUDED\tUNRELATED" >> EXC; next
      }
      # Everything else is not positively affiliated → excluded (reported AMBIGUOUS).
      print kind"\t"id"\t"name"\tEXCLUDED\tAMBIGUOUS" >> EXC
    }
  ' "$infile"
}

# gen_delete_plan <manifest> <out_plan>
# Emits one "<kind> <id>" token per IN resource, ordered container→volume→network→image so
# dependents are removed before dependencies. The executor maps each token to a single scoped
# docker command; this function can NEVER emit a prune or an unscoped deletion.
gen_delete_plan() {
  local manifest="$1" out="$2"; : > "$out"
  local k
  for k in container volume network image; do
    awk -F'\t' -v K="$k" '$4=="IN" && $1==K { print $1" "$2 }' "$manifest" >> "$out"
  done
}

# summarise <manifest_or_excluded> — sanitised category counts only (no ids, no names).
# Prints lines "<bucket>\t<kind>\t<count>".
summarise() {
  awk -F'\t' '{ key=$4"\t"$1; c[key]++ } END { for (k in c) print k"\t"c[k] }' "$1" | sort
}
