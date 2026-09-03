import * as semver from 'semver';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find the newest version on the same prerelease "line" as `currentVersion`, where the line is
 * defined as the same major.minor.patch and the same prerelease identifier (i.e. `alpha` for
 * `4.0.0-alpha.3`). Returns undefined when nothing newer than `currentVersion` exists on that line.
 *
 * Mirrors `ProjectManager.getLatestPrereleaseVersion` in rokucommunity/workflows.
 */
export function getLatestPrereleaseVersion(currentVersion: string, availableVersions: string[]): string | undefined {
  const preid = semver.prerelease(currentVersion)?.[0];
  if (preid === undefined) {
    return undefined;
  }
  const candidates = availableVersions.filter((version) => {
    if (!semver.valid(version) || semver.lte(version, currentVersion)) {
      return false;
    }
    //must be on the same major.minor.patch, with the same prerelease identifier
    return semver.diff(version, currentVersion) === 'prerelease' && semver.prerelease(version)?.[0] === preid;
  });
  return candidates.length > 0 ? semver.rsort(candidates)[0] : undefined;
}

/**
 * Given the version of a dependency that a project last released with, figure out which version that
 * dependency would be bumped to on the project's next release. This intentionally mirrors the install
 * logic in `ProjectManager.innerInstallDependencies` in rokucommunity/workflows, so the tracker's
 * "release needed" decision matches what the release workflow will actually do.
 *
 * There are three cases:
 *  1. **Lockstep.** The project itself is a prerelease (i.e. `1.2.3-alpha.1`) and the dependency carries
 *     the exact same prerelease suffix. Both move to the same next prerelease number and no further, so
 *     the target is `semver.inc(currentDependencyVersion, 'prerelease')` — but only if that version has
 *     actually been published.
 *  2. **Prerelease dependency, not locked.** The dependency is on a prerelease line the project isn't
 *     locked to (i.e. stable `roku-debug@0.24.2` depending on `roku-deploy@4.0.0-alpha.5`). `latest` would
 *     resolve to the newest *stable* version, which is a downgrade, so stay on that prerelease line and
 *     take the newest version published on it.
 *  3. **Otherwise.** Assume the dependency will install its `latest` (i.e. the tip of the dependency's
 *     own release line).
 *
 * In every case a target that would be a *downgrade* from what we already depend on is rejected, and we
 * report the current version instead (the release workflow skips the install in that situation).
 *
 * @param projectVersion the version of the project doing the depending
 * @param currentDependencyVersion the dependency version this project last released with
 * @param latestDependencyVersion the tip-of-release-line version of the dependency (its `latest`)
 * @param availableDependencyVersions every version published for the dependency, when known. Required to
 *                                    resolve cases 1 and 2; when omitted those cases fall back to the
 *                                    current version rather than guessing at an unpublished version.
 */
export function resolveTargetDependencyVersion(options: {
  projectVersion: string | undefined;
  currentDependencyVersion: string | undefined;
  latestDependencyVersion: string | undefined;
  availableDependencyVersions?: string[];
}): string | undefined {
  const { projectVersion, currentDependencyVersion, latestDependencyVersion, availableDependencyVersions } = options;

  //without a known current version there's nothing to compare against, so just take the tip
  if (!currentDependencyVersion || !semver.valid(currentDependencyVersion)) {
    return latestDependencyVersion;
  }

  //the prerelease suffix of the project doing the depending (i.e. `alpha.1` for `1.2.3-alpha.1`)
  const projectPreidBuildKey =
    projectVersion && semver.prerelease(projectVersion) ? projectVersion.split('-')[1] : undefined;

  let target: string | undefined;

  if (projectPreidBuildKey && semver.prerelease(currentDependencyVersion) && currentDependencyVersion.endsWith(projectPreidBuildKey)) {
    //case 1: lockstep. move both to the same next prerelease number, but only if it's actually published
    const nextVersion = semver.inc(currentDependencyVersion, 'prerelease') ?? undefined;
    if (nextVersion && availableDependencyVersions?.includes(nextVersion)) {
      target = nextVersion;
    }
  } else if (semver.prerelease(currentDependencyVersion)) {
    //case 2: stay on the dependency's prerelease line rather than falling back to a stable `latest`
    target = availableDependencyVersions
      ? getLatestPrereleaseVersion(currentDependencyVersion, availableDependencyVersions)
      : undefined;
  } else {
    //case 3: plain `latest`
    target = latestDependencyVersion;
  }

  //never report a downgrade; the release workflow skips the install in that case
  if (!target || !semver.valid(target) || semver.lt(target, currentDependencyVersion)) {
    return currentDependencyVersion;
  }
  return target;
}

export function createClassFactory(classes: string[]) {
  let map = new Map<string, string>();
  return function (key: string) {
    if (map.has(key)) {
      return map.get(key);
    }
    let result = classes[map.size % classes.length];
    map.set(key, result);
    return result;
  }
}
