#!/usr/bin/env bash
#
# publish-pages.sh - publish every branch and tag into the pages branch.
#
# The root of the pages branch holds the root ref (main by default). Every other
# branch and every tag is published under ver/, which keeps the root clean and
# leaves one name reserved instead of one per branch:
#
#   https://<user>.codeberg.page/EstyJS/
#   https://<user>.codeberg.page/EstyJS/ver/development/
#   https://<user>.codeberg.page/EstyJS/ver/v2.2.0/
#
# The pages branch is rebuilt from the refs on every run, so a deleted branch
# loses its directory. Identical files share their git object, so a published
# copy costs the difference and not the whole site.
#
# Forgejo releases are their tags, which are published; release assets are not.
#
# usage:
#   tools/publish-pages.sh [options]
#
# options:
#   --remote NAME     remote to read and push (default origin)
#   --branch NAME     branch to publish into (default pages)
#   --root REF        ref served at the root (default main)
#   --into DIR        directory holding the versions (default ver, empty for
#                     the root of the branch)
#   --skip PATTERN    skip refs matching this shell pattern, repeatable
#   --nojekyll        add .nojekyll, needed on GitHub Pages
#   --no-push         commit but do not push
#   --dry-run         show what would be published, change nothing
#
# GitHub Pages runs the published branch through Jekyll, which drops folders
# called vendor and node_modules and anything starting with _ or . . Publishing
# there needs --nojekyll, or vendor/marked.min.js goes missing and the
# documentation viewer stops working.
#
set -euo pipefail

remote=origin
pages_branch=pages
root_ref=main
into=ver
push=yes
dry=no
nojekyll=no
skips=()

while [ $# -gt 0 ]; do
    case "$1" in
        --remote) remote=$2; shift 2 ;;
        --branch) pages_branch=$2; shift 2 ;;
        --root)   root_ref=$2; shift 2 ;;
        --into)   into=$2; shift 2 ;;
        --skip)   skips+=("$2"); shift 2 ;;
        --nojekyll) nojekyll=yes; shift ;;
        --no-push) push=no; shift ;;
        --dry-run) dry=yes; push=no; shift ;;
        -h|--help) sed -n '2,41p' "$0" | sed 's/^# \?//'; exit 0 ;;
        *) echo "unknown option $1" >&2; exit 1 ;;
    esac
done

cd "$(git rev-parse --show-toplevel)"

skipped() {
    local ref=$1 pattern
    for pattern in ${skips+"${skips[@]}"}; do
        # shellcheck disable=SC2053
        [[ $ref == $pattern ]] && return 0
    done
    return 1
}

# a directory name that survives branch names containing a slash
directory() { echo "${1//\//-}"; }

echo "fetching $remote"
git fetch --quiet --prune --prune-tags --tags "$remote"

if ! git rev-parse --verify --quiet "refs/remotes/$remote/$root_ref" >/dev/null; then
    echo "$remote/$root_ref does not exist" >&2
    exit 1
fi

if [ -n "$into" ] && git ls-tree --name-only "refs/remotes/$remote/$root_ref" | grep -qx "$into"; then
    echo "$remote/$root_ref already has a $into entry; pick another --into" >&2
    exit 1
fi

# what to publish: the root ref at the top, every other branch and tag below it
refs=()
while read -r branch; do
    [ -z "$branch" ] && continue
    [ "$branch" = "$root_ref" ] && continue
    [ "$branch" = "$pages_branch" ] && continue
    [ "$branch" = HEAD ] && continue
    skipped "$branch" && continue
    refs+=("refs/remotes/$remote/$branch:$(directory "$branch")")
done < <(git for-each-ref --format='%(refname:strip=3)' "refs/remotes/$remote")

while read -r tag; do
    [ -z "$tag" ] && continue
    skipped "$tag" && continue
    refs+=("refs/tags/$tag:$(directory "$tag")")
done < <(git tag --list)

echo "root: $remote/$root_ref"
for entry in ${refs+"${refs[@]}"}; do
    echo "  ${into:+$into/}${entry#*:}  <- ${entry%%:*}"
done

[ "$dry" = yes ] && { echo "dry run, nothing written"; exit 0; }

build=$(mktemp -d)
worktree=$(mktemp -d)
trap 'rm -rf "$build"; git worktree remove --force "$worktree" 2>/dev/null || true; rm -rf "$worktree"' EXIT

# the site as it will be served
git archive "refs/remotes/$remote/$root_ref" | tar -x -C "$build"
for entry in ${refs+"${refs[@]}"}; do
    ref=${entry%%:*}
    dir=${entry#*:}
    mkdir -p "$build/${into:+$into/}$dir"
    git archive "$ref" | tar -x -C "$build/${into:+$into/}$dir"
done

if [ "$nojekyll" = yes ]; then
    touch "$build/.nojekyll"
fi

# check out the pages branch beside the working copy, so the current checkout
# is left alone
if git rev-parse --verify --quiet "refs/remotes/$remote/$pages_branch" >/dev/null; then
    git worktree add --quiet --force -B "$pages_branch" "$worktree" "refs/remotes/$remote/$pages_branch"
else
    echo "creating $pages_branch"
    git worktree add --quiet --force --detach "$worktree"
    git -C "$worktree" checkout --quiet --orphan "$pages_branch"
    git -C "$worktree" rm --quiet -rf . 2>/dev/null || true
fi

# replace the contents wholesale, so refs that are gone take their directory
find "$worktree" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$build/." "$worktree/"

git -C "$worktree" add --all
if git -C "$worktree" diff --cached --quiet; then
    echo "nothing changed"
    exit 0
fi

count=$(( ${#refs[@]} + 1 ))
git -C "$worktree" commit --quiet -m "Publish $count versions from $(git rev-parse --short "refs/remotes/$remote/$root_ref")"
echo "committed $(git -C "$worktree" rev-parse --short HEAD) on $pages_branch"

if [ "$push" = yes ]; then
    git -C "$worktree" push --quiet "$remote" "$pages_branch"
    echo "pushed to $remote/$pages_branch"
else
    echo "not pushed"
fi
