<script lang="ts">
	import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
	import { throttling } from '@octokit/plugin-throttling';
	import { type Project, getAllProjects } from './projects';
	import { createClassFactory, sleep } from './util';
	import { http } from './http';
	import * as localforage from 'localforage';

	const MAX_COLLAPSED_COMMITS = 4;

	const SECURITY_AUDIT_WORKFLOW = 'security-audit.yml';

	function getSecurityAuditRunsUrl(project: Project): string {
		const branch = encodeURIComponent(project.releaseLine.branch);
		return `https://github.com/${project.repository.owner}/${project.repository.repository}/actions/workflows/${SECURITY_AUDIT_WORKFLOW}?query=branch%3A${branch}`;
	}

	/**
	 * Map a shields.io badge's right-side text to a status bucket. Anything we don't recognize
	 * (including "no status", "repo or workflow not found", missing repo) falls through to 'unknown'.
	 */
	function classifyShieldsMessage(svgText: string): Project['ciStatus'] {
		if (svgText.includes('>passing<')) return 'success';
		if (svgText.includes('>failing<')) return 'failure';
		if (svgText.includes('>in progress<') || svgText.includes('>queued<') || svgText.includes('>starting<') || svgText.includes('>waiting<')) return 'pending';
		return 'unknown';
	}

	/**
	 * Resolve the CI status for the project's security-audit workflow on its release-line branch
	 * by reading the shields.io badge SVG. Same network cost as rendering the badge image directly,
	 * but lets us drop the status text and treat 404-style responses as 'unknown' instead of red.
	 */
	async function fetchCiStatus(project: Project): Promise<Project['ciStatus']> {
		const branch = encodeURIComponent(project.releaseLine.branch);
		const url = `https://img.shields.io/github/actions/workflow/status/${project.repository.owner}/${project.repository.repository}/${SECURITY_AUDIT_WORKFLOW}?branch=${branch}`;
		try {
			const response = await fetch(url);
			if (!response.ok) return 'unknown';
			return classifyShieldsMessage(await response.text());
		} catch (e) {
			console.error(`${project.name}: failed to fetch CI status`, e);
			return 'unknown';
		}
	}

	/** How long (ms) to trust a cached "list open release PRs" API result before we'd spend another API call. */
	const RELEASE_PR_API_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

	/**
	 * Generate the set of plausible next-version strings for a release that's currently `currentVersion`.
	 * This is intentionally LOSSY: it covers the common patch/minor/major bumps and their `-alpha.0`/`-beta.0`
	 * prerelease starts. Anything fancier (e.g. `-alpha.3`) is left to the API fallback. We only use these to
	 * probe `release/<version>` branches via raw.githubusercontent (zero GitHub API quota cost).
	 */
	function guessNextVersions(currentVersion: string): string[] {
		const match = /^(\d+)\.(\d+)\.(\d+)/.exec(currentVersion);
		if (!match) return [];
		const major = Number(match[1]);
		const minor = Number(match[2]);
		const patch = Number(match[3]);
		const bumps = [
			`${major}.${minor}.${patch + 1}`, // patch
			`${major}.${minor + 1}.0`, // minor
			`${major + 1}.0.0` // major
		];
		const guesses: string[] = [];
		for (const bump of bumps) {
			guesses.push(bump, `${bump}-alpha.0`, `${bump}-beta.0`);
		}
		return guesses;
	}

	/**
	 * Cheap, zero-API-quota probe: does a `release/<version>` branch exist for any of our guessed next versions?
	 * Hits raw.githubusercontent (the same network class as the package-lock fetches), so refreshing the page
	 * doesn't burn GitHub API rate limit. Returns the first matching version, or undefined if none are found.
	 */
	async function probeReleaseBranches(project: Project): Promise<string | undefined> {
		const guesses = guessNextVersions(project.currentVersion ?? '');
		const results = await Promise.all(
			guesses.map(async (version) => {
				try {
					await http.get({
						url: `https://raw.githubusercontent.com/${project.repository.owner}/${project.repository.repository}/refs/heads/release/${version}/package.json`,
						cacheBusting: true
					});
					return version;
				} catch {
					return undefined;
				}
			})
		);
		return results.find((x) => x !== undefined);
	}

	/**
	 * Authoritative-but-costly fallback: list the repo's open PRs once and find one whose title or head branch
	 * looks like a release (a bare semver title, or a `release/<version>` head ref). Costs one GitHub API
	 * request, so the result is cached in localforage with a TTL to keep page refreshes from re-spending quota.
	 */
	async function findReleasePrViaApi(project: Project): Promise<Project['releaseInProgress'] | undefined> {
		const cacheKey = `release-pr: ${project.repository.owner}/${project.repository.repository}`;
		try {
			const cached = await localforage.getItem<{ at: number; value: Project['releaseInProgress'] | null }>(cacheKey);
			if (cached && Date.now() - cached.at < RELEASE_PR_API_CACHE_TTL) {
				return cached.value ?? undefined;
			}

			const response = await octokit.rest.pulls.list({
				owner: project.repository.owner,
				repo: project.repository.repository,
				state: 'open',
				per_page: 100
			});

			const semver = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
			let found: Project['releaseInProgress'] | undefined;
			for (const pr of response.data) {
				const branchVersion = /^release\/(.+)$/.exec(pr.head.ref)?.[1];
				const titleVersion = semver.test(pr.title.trim()) ? pr.title.trim().replace(/^v/, '') : undefined;
				const version = titleVersion ?? (branchVersion && semver.test(branchVersion) ? branchVersion.replace(/^v/, '') : undefined);
				if (version) {
					found = { version, url: pr.html_url, prNumber: pr.number };
					break;
				}
			}

			await localforage.setItem(cacheKey, { at: Date.now(), value: found ?? null });
			return found;
		} catch (e) {
			console.error(`${project.name}: failed to look up release PR`, e);
			return undefined;
		}
	}

	/**
	 * Determine whether a release is already in progress for this project, preferring the zero-quota raw probe
	 * and only falling back to the (cached) GitHub API when the probe finds nothing. Should only be called for
	 * projects that plausibly need a release, to avoid spending requests on up-to-date projects.
	 */
	async function fetchReleaseInProgress(project: Project): Promise<Project['releaseInProgress'] | undefined> {
		const probedVersion = await probeReleaseBranches(project);
		if (probedVersion) {
			return {
				version: probedVersion,
				url: `https://github.com/${project.repository.owner}/${project.repository.repository}/tree/release/${probedVersion}`
			};
		}
		return findReleasePrViaApi(project);
	}

	let projects = $state(getAllProjects().filter((x) => x.hide !== true));

	/**
	 * View mode: 'default' shows projects grouped by release line (original view),
	 * 'release-flow' shows projects in dependency tiers within each release line.
	 * Persisted via localStorage and URL query param (URL takes precedence for sharing).
	 */
	function getInitialViewMode(): 'default' | 'release-flow' {
		// Check URL parameter first (for sharing links)
		const param = new URLSearchParams(window.location.search).get('view');
		if (param === 'release-flow' || param === 'default') {
			return param;
		}
		// Fall back to localStorage for persistence between visits
		const stored = localStorage.getItem('view-mode');
		return stored === 'release-flow' ? 'release-flow' : 'default';
	}

	function setViewMode(mode: 'default' | 'release-flow') {
		viewMode = mode;
		// Save to localStorage for persistence
		localStorage.setItem('view-mode', mode);
		// Also update URL for sharing
		const url = new URL(window.location.href);
		if (mode === 'default') {
			url.searchParams.delete('view');
		} else {
			url.searchParams.set('view', mode);
		}
		window.history.replaceState({}, '', url.toString());
	}

	let viewMode: 'default' | 'release-flow' = $state(getInitialViewMode());

	/**
	 * GitHub token for authenticated API requests (higher rate limits).
	 * Stored in localStorage so it persists across sessions.
	 */
	let githubToken: string = $state(localStorage.getItem('github-token') ?? '');
	let showTokenInput: boolean = $state(false);
	let showUserMenu: boolean = $state(false);

	function saveGithubToken(token: string) {
		githubToken = token.trim();
		if (githubToken) {
			localStorage.setItem('github-token', githubToken);
		} else {
			localStorage.removeItem('github-token');
		}
		octokit = createOctokit(githubToken || undefined);
	}

	function signOut() {
		saveGithubToken('');
		showTokenInput = false;
	}

	/**
	 * Compute dependency tiers for projects within a release line.
	 * Tier 0 = no dependencies (or all deps are outside this release line)
	 * Tier 1 = depends only on tier 0 projects
	 * Tier N = depends on projects from tiers 0..N-1
	 *
	 * Dependencies that reference other release lines are resolved by finding
	 * the referenced project's tier in its own release line, treating cross-release-line
	 * deps as already satisfied (tier 0).
	 */
	function computeTiers(releaseLineProjects: Project[], allProjects: Project[]): { tier: number; projects: Project[] }[] {
		const tierMap = new Map<Project, number>();

		// Build a lookup: (name, releaseLine) -> Project
		const projectLookup = new Map<string, Project>();
		for (const p of allProjects) {
			projectLookup.set(`${p.name}::${p.releaseLine.name}`, p);
		}

		// Iteratively assign tiers
		const unassigned = new Set(releaseLineProjects);
		let currentTier = 0;
		const maxIterations = releaseLineProjects.length + 1;

		while (unassigned.size > 0 && currentTier < maxIterations) {
			const assignedThisRound: Project[] = [];

			for (const project of unassigned) {
				const allDepsResolved = project.dependencies.every((dep) => {
					const depProject = projectLookup.get(`${dep.name}::${dep.releaseLine}`);
					if (!depProject) {
						// Dependency not tracked at all - treat as satisfied
						return true;
					}
					if (!unassigned.has(depProject) && !releaseLineProjects.includes(depProject)) {
						// Dependency is in a different release line - treat as satisfied (tier 0 equivalent)
						return true;
					}
					if (releaseLineProjects.includes(depProject)) {
						// Dependency is in this release line - must already have a tier assigned
						return tierMap.has(depProject);
					}
					// Dependency is outside this release line - satisfied
					return true;
				});

				if (allDepsResolved) {
					assignedThisRound.push(project);
				}
			}

			for (const p of assignedThisRound) {
				tierMap.set(p, currentTier);
				unassigned.delete(p);
			}

			if (assignedThisRound.length === 0) {
				// Circular dependency or unresolvable - assign remaining to current tier
				for (const p of unassigned) {
					tierMap.set(p, currentTier);
				}
				break;
			}

			currentTier++;
		}

		// Group by tier
		const tiers = new Map<number, Project[]>();
		for (const [project, tier] of tierMap) {
			if (!tiers.has(tier)) {
				tiers.set(tier, []);
			}
			tiers.get(tier)!.push(project);
		}

		// Sort and return
		return [...tiers.entries()]
			.sort(([a], [b]) => a - b)
			.map(([tier, projects]) => ({ tier, projects }));
	}

	/**
	 * Check if all projects in prior tiers (for a given release line) are up to date,
	 * meaning this tier is ready to release.
	 */
	function isProjectEffectivelyUpToDate(project: Project): boolean {
		return project.ignored || !project.updateRequired;
	}

	function isTierReady(releaseLine: string, tierIndex: number, allTiers: { tier: number; projects: Project[] }[]): boolean {
		// Tier 0 is always ready (no prior tiers)
		if (tierIndex === 0) return true;

		// Check all projects in tiers before this one
		for (let i = 0; i < tierIndex; i++) {
			for (const project of allTiers[i].projects) {
				if (project.isLoading !== false && !project.ignored) return false;
				if (!isProjectEffectivelyUpToDate(project)) return false;
			}
		}
		return true;
	}

	function getTierStatus(releaseLine: string, tierIndex: number, allTiers: { tier: number; projects: Project[] }[]): 'ready' | 'blocked' | 'pending' | 'done' {
		const tierProjects = allTiers[tierIndex].projects;
		const anyLoading = tierProjects.some(p => p.isLoading !== false && !p.ignored);
		if (anyLoading) return 'pending';

		// If all projects in this tier are up to date (or ignored), it's done
		const allUpToDate = tierProjects.every(p => isProjectEffectivelyUpToDate(p));
		if (allUpToDate) return 'done';

		// Check if prior tiers are all up to date
		if (tierIndex === 0) return 'ready';
		const priorReady = isTierReady(releaseLine, tierIndex, allTiers);
		const anyPriorLoading = allTiers.slice(0, tierIndex).some(t => t.projects.some(p => p.isLoading !== false && !p.ignored));
		if (anyPriorLoading) return 'pending';
		return priorReady ? 'ready' : 'blocked';
	}


	/**
	 * Collect all transitive dependencies of a project within its release line.
	 */
	function getTransitiveDeps(project: Project, allProjects: Project[]): Set<Project> {
		const result = new Set<Project>();
		const queue = [project];
		while (queue.length > 0) {
			const current = queue.pop()!;
			for (const dep of current.dependencies) {
				const depProject = allProjects.find(p => p.name === dep.name && p.releaseLine.name === dep.releaseLine);
				if (depProject && !result.has(depProject)) {
					result.add(depProject);
					queue.push(depProject);
				}
			}
		}
		return result;
	}

	/**
	 * Toggle focus on a project: ignore all projects in previous tiers that are NOT transitive
	 * dependencies of this project. If they're already ignored, un-ignore them.
	 */
	function focusProject(project: Project) {
		const releaseLineProjects = projects.filter(p => p.releaseLine.name === project.releaseLine.name);
		const tiers = computeTiers(releaseLineProjects, projects);
		const projectTierIndex = tiers.findIndex(t => t.projects.includes(project));
		if (projectTierIndex <= 0) return;

		const deps = getTransitiveDeps(project, projects);

		const nonDepsInPriorTiers: Project[] = [];
		for (let i = 0; i < projectTierIndex; i++) {
			for (const p of tiers[i].projects) {
				if (!deps.has(p)) {
					nonDepsInPriorTiers.push(p);
				}
			}
		}

		const anyIgnored = nonDepsInPriorTiers.some(p => p.ignored);
		for (const p of nonDepsInPriorTiers) {
			p.ignored = anyIgnored ? false : true;
		}
		projects = projects;
	}

	function getTierStatusLabel(status: string): string {
		switch (status) {
			case 'ready': return 'Ready to release';
			case 'blocked': return 'Blocked';
			case 'pending': return 'Pending';
			case 'done': return 'Up to date';
			default: return status;
		}
	}

	//DEBUGGING features
	let enableTestMode = false;
	let commitsDebugFilter: string[] = [];

	// enableTestMode = true;
	// commitsDebugFilter.push('brighterscript-formatter');
	// projects = projects.filter(
	// 	(x) => x.releaseLine.name === 'mainline' && ['brighterscript', 'brighterscript-formatter', '@rokucommunity/bslib', '@rokucommunity/logger', 'roku-deploy'].includes(x.name) === true
	// );

	const releaseLines = [
		...projects.reduce((acc, project) => {
			acc.add(project.releaseLine.name);
			return acc;
		}, new Set<string>())
	];

	const getReleaseLineClass = createClassFactory(['releaseline1', 'releaseline2', 'releaseline3', 'releaseline4', 'releaseline5']);

	const COLLAPSED_RELEASE_LINES_KEY = 'collapsed-release-lines';

	/**
	 * Load the persisted collapsed/expanded state of each release line from localStorage so the user's
	 * choices survive page refreshes.
	 */
	function getInitialCollapsedReleaseLines(): Record<string, boolean> {
		try {
			const stored = localStorage.getItem(COLLAPSED_RELEASE_LINES_KEY);
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	}

	let collapsedReleaseLines: Record<string, boolean> = $state(getInitialCollapsedReleaseLines());

	/**
	 * Tracks which dependency change panels are expanded. Key is `${projectName}::${depName}`.
	 */
	let expandedDependencyChanges: Record<string, boolean> = $state({});

	/**
	 * Caches fetched commits for dependency change panels. Key is `${depName}@v${from}...v${to}`.
	 * Value is an array of commits, or `null` if currently loading.
	 */
	let dependencyChangesCache: Record<string, RestEndpointMethodTypes["repos"]["compareCommits"]["response"]['data']['commits'] | null> = $state({});

	function getDependencyChangesKey(project: Project, dependency: { name: string }) {
		return `${project.name}::${dependency.name}`;
	}

	function getDependencyCommitsCacheKey(dProject: Project, fromVersion: string, toVersion: string) {
		return `${dProject.repository.owner}/${dProject.repository.repository}@v${fromVersion}...v${toVersion}`;
	}

	async function toggleDependencyChanges(project: Project, dependency: { name: string; releaseLine: string; versionFromLatestRelease?: string }) {
		const panelKey = getDependencyChangesKey(project, dependency);
		const dProject = findDependency(dependency);
		expandedDependencyChanges[panelKey] = !expandedDependencyChanges[panelKey];

		// Fetch commits if expanding and not yet cached
		if (expandedDependencyChanges[panelKey] && dProject && dependency.versionFromLatestRelease && dProject.currentVersion) {
			const cacheKey = getDependencyCommitsCacheKey(dProject, dependency.versionFromLatestRelease, dProject.currentVersion);
			if (!(cacheKey in dependencyChangesCache)) {
				dependencyChangesCache[cacheKey] = null; // mark as loading
				try {
					const response = await octokit.rest.repos.compareCommits({
						owner: dProject.repository.owner,
						repo: dProject.repository.repository,
						base: `v${dependency.versionFromLatestRelease}`,
						head: `v${dProject.currentVersion}`
					});
					dependencyChangesCache[cacheKey] = response.data.commits;
				} catch (e) {
					console.error(e);
					dependencyChangesCache[cacheKey] = [];
				}
			}
		}
	}

	/**
	 * When clicking on a project's "update required" button, this is the project you clicked the button for.
	 */
	let selectedProjectForUpdate: Project | undefined = $state();

	const MyOctokit = Octokit.plugin(throttling);

	function createOctokit(token?: string) {
		return new MyOctokit({
			...(token ? { auth: token } : {}),
			throttle: {
				onRateLimit: (retryAfter, options) => {
					console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
					if (options.request.retryCount <= 3) {
						console.log(`Retrying after ${retryAfter} seconds!`);
						return true;
					}
				},
				onSecondaryRateLimit: (retryAfter, options, octokit) => {
					octokit.log.warn(`Secondary quota detected for request ${options.method} ${options.url}`);
				}
			}
		});
	}

	let octokit = createOctokit(githubToken || undefined);

	/**
	 * Fetch and parse a project's `package-lock.json` from the given git ref. Tries each of the project's
	 * `packageLockLocations` (defaulting to `package-lock.json` at the repo root) in order, returning the
	 * first one that resolves to a valid file. Throws if none of the locations yield a file.
	 */
	async function fetchPackageLockJson(project: Project, ref: string, options: { cacheBusting?: true; cacheInLocalStorage?: boolean }) {
		const locations = project.packageLockLocations ?? ['package-lock.json'];
		let lastError: unknown;
		for (const location of locations) {
			try {
				const response = await http.get({
					url: `https://raw.githubusercontent.com/${project.repository.owner}/${project.repository.repository}/${ref}/${location}`,
					...options
				});
				return JSON.parse(response);
			} catch (e) {
				lastError = e;
			}
		}
		throw new Error(
			`${project.name} (${project.releaseLine.branch}): could not find a package-lock.json at ${ref} in any of [${locations.join(', ')}]`,
			{ cause: lastError }
		);
	}

	async function hydrateProject(project: Project) {
		project.isLoading = true;
		project.loadFailed = false;
		try {
			await hydrateProjectInner(project);
		} catch (e) {
			console.error(`${project.name} (${project.releaseLine.branch}): hydration failed`, e);
			project.loadFailed = true;
		} finally {
			project.isLoading = false;
		}
	}

	async function hydrateProjectInner(project: Project) {
		//temporarily generate dummy data for testing purposes instead of hitting the API
		if (enableTestMode) {
			await sleep(Math.random() * 1000);

			//generate a random semver version
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
			for (const dep of project.dependencies) {
				dep.versionFromLatestRelease = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
			}
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;

			return;
		}

		//TODO fetch list of open PRs and add links for open release PRs

		console.log(`${project.name} (${project.releaseLine.branch}): hydrating project`);

		const packageLockJson = await fetchPackageLockJson(project, `refs/heads/${project.releaseLine.branch}`, {
			//prevent caching of this package.json since it could change at any time
			cacheBusting: true
		});
		project.currentVersion = packageLockJson.version;
		//now update the dependencies
		for (const dependency of project.dependencies) {
			dependency.versionFromTipOfReleaseLine = packageLockJson?.packages?.[`node_modules/${dependency.name}`]?.version;
		}

		//fetch most recent release package-lock.json
		const tagPackageLockJson = await fetchPackageLockJson(project, `refs/tags/v${packageLockJson.version}`, {
			//when making a request, prevent it from being cached by the browser
			cacheBusting: true,
			//this request can be cached since files from tag refs should never change
			cacheInLocalStorage: true
		});

		project.unreleasedCommits = await fetchUnreleasedCommits(project);
		project.ciStatus = await fetchCiStatus(project);

		//now update the dependencies
		for (const dependency of project.dependencies) {
			dependency.versionFromLatestRelease = tagPackageLockJson?.packages?.[`node_modules/${dependency.name}`]?.version;
		}

		//if this project has unreleased (non-chore) commits, check whether a release is already in progress.
		//this is gated so we only spend probe/API requests on projects that plausibly need a release.
		project.releaseInProgress = undefined;
		const hasReleasableCommits = (project.unreleasedCommits ?? []).some(
			(x) => !x.commit.message.startsWith('(chore)') && !x.commit.message.startsWith('chore')
		);
		if (hasReleasableCommits) {
			project.releaseInProgress = await fetchReleaseInProgress(project);
		}
	}

	/**
	 * Does this project have any unreleased commits? Returns `true` unless we can specifically determine that there are none
	 */
	async function fetchUnreleasedCommits(project: Project) {
		//filter to only debug projects when enabled (to guard against rate limiting)
		if (commitsDebugFilter.length > 0 && !commitsDebugFilter.includes(project.name)) {
			return undefined;
		}
		try {
			const response = await octokit.rest.repos.compareCommits({
				owner: project.repository.owner,
				repo: project.repository.repository,
				base: `v${project.currentVersion}`, // The tag to compare from
				head: project.releaseLine.branch // The branch or commit to compare to
			});

			const commits = response.data.commits; // Array of commits after the tag
			if (commits.length > 0) {
				console.log(
					`${project.name} (${project.releaseLine.branch}): Found ${commits.length} commits after tag v${project.currentVersion}`
				);
				return commits; // There are unreleased commits
			} else {
				console.log(`${project.name} (${project.releaseLine.branch}): No commits found after tag v${project.currentVersion}`);
				return []; // No unreleased commits
			}
		} catch (e) {
			console.error(e);
			return undefined; // Error occurred while fetching commits, return undefined so we don't completely fail the hydration
		}
	}

	function computeProjectNeedsUpdate(project: Project) {
		// Compute whether an update is required
		const hasOutdatedDependencies = !project.dependencies.every((dep) => {
			const dProject = projects.find((x) => x.name === dep.name && x.releaseLine.name === dep.releaseLine);
			return !dProject?.currentVersion || dProject.currentVersion === dep.versionFromLatestRelease;
		});
		//projects who don't yet have their commits fetched will always be marked as needing an update
		const unreleasedFilteredCommits =
			project.unreleasedCommits
				?.filter((x) => !x.commit.message.startsWith('(chore)'))
				?.filter((x) => !x.commit.message.startsWith('chore')) ?? [];
		project.updateRequired = hasOutdatedDependencies || !project.unreleasedCommits || unreleasedFilteredCommits.length > 0;
	}

	function dispatchRelease(project: Project) {
		//TODO dispatch a release PR to the project
		console.log(`Dispatching release for ${project.name}`);
		selectedProjectForUpdate = undefined;
	}

	function toggleProjectUpdateActive(project: Project | undefined) {
		//TODO disabled for now since we don't yet support dispatching workflows from this page
		return;
		if (project?.updateRequired === false) {
			selectedProjectForUpdate = undefined;
		}
		if (project?.updateRequired !== true || selectedProjectForUpdate === project) {
			selectedProjectForUpdate = undefined;
		} else {
			selectedProjectForUpdate = project;
		}
	}

	function findDependency(dependency: { name: string; releaseLine: string }) {
		return projects.find((x) => x.name === dependency.name && x.releaseLine.name === dependency.releaseLine);
	}

	function getFilteredProjectCommits(project: Project) {
		const commits = project.unreleasedCommits ?? [];

		if (project.showAllCommits === true) {
			return commits;
		} else {
			return commits.slice(0, MAX_COLLAPSED_COMMITS);
		}
	}

	function toggleProjectShowAllCommits(project: Project) {
		project.showAllCommits = !project.showAllCommits;
		projects = projects;
	}

	function toggleReleaseLineCollapsed(releaseLine: string) {
		//build a fresh object (rather than mutating in place) so the `$state` proxy reliably re-renders,
		//and so only this single release line's flag changes
		const nowCollapsed = !collapsedReleaseLines[releaseLine];
		collapsedReleaseLines = { ...collapsedReleaseLines, [releaseLine]: nowCollapsed };
		//persist so the user's expand/collapse choices survive a refresh
		localStorage.setItem(COLLAPSED_RELEASE_LINES_KEY, JSON.stringify(collapsedReleaseLines));
		//a release line that was just expanded may contain projects we skipped hydrating; fetch them now
		if (!nowCollapsed) {
			hydrateCollapsedReleaseLine(releaseLine);
		}
	}

	/**
	 * Hydrate any not-yet-loaded projects in a release line that was just expanded. Projects in
	 * collapsed release lines are skipped during the initial load to save network requests, so we
	 * lazily fetch them the first time the user opens that line.
	 */
	async function hydrateCollapsedReleaseLine(releaseLine: string) {
		let handledProjects: Project[] = [];
		for (const project of projects.filter((x) => x.releaseLine.name === releaseLine)) {
			//only hydrate projects that haven't been loaded yet
			if (project.currentVersion === undefined && project.isLoading !== true) {
				refreshProject(project, { handledProjects: handledProjects });
			}
		}
	}

	/**
	 * Refreshes the project and all of its dependencies
	 */
	async function refreshProject(
		project: Project,
		options?: { refreshDependencies?: boolean; handledProjects?: Project[]; skipSelf?: boolean }
	) {
		const handledProjects = options?.handledProjects ?? [];
		const refreshDependencies = options?.refreshDependencies ?? true;

		//if we have already refreshed this project, don't do it again
		if (handledProjects.includes(project)) {
			return;
		}

		handledProjects.push(project);

		project.isLoading = true;
		//clear any prior failed state so a refresh shows the loading indicator instead of the stale failure
		project.loadFailed = false;

		projects = projects;

		//add a small timeout to let the UI show the loading state
		await sleep(300);

		if (refreshDependencies) {
			//first refresh all of the project's dependencies
			for (const dependency of project.dependencies) {
				const dProject = findDependency(dependency);

				//if we aren't actively reloading this project, reload it now
				if (dProject) {
					await refreshProject(dProject, { refreshDependencies: refreshDependencies, handledProjects: handledProjects });
				}
			}
		}

		if (options?.skipSelf !== true) {
			//now refresh this project
			await hydrateProject(project);
		}

		//do another pass to ensure all projects are up to date
		for (const project of projects) {
			computeProjectNeedsUpdate(project);
		}

		//trigger reactivity after every project hydration
		projects = projects;
	}

	async function hydrateProjects() {
		let handledProjects: Project[] = [];
		for (const project of projects) {
			//skip projects in collapsed release lines to save network requests; they'll be hydrated
			//lazily when the user expands that release line
			if (collapsedReleaseLines[project.releaseLine.name]) {
				continue;
			}
			refreshProject(project, { handledProjects: handledProjects });
		}
	}

	//temporarily only keep one of the projects to keep our rate limit down during testing
	hydrateProjects();
</script>

{#snippet projectCard(project: Project)}
	<div class="card {project.ignored ? 'ignored' : project.loadFailed ? 'failed' : project.isLoading !== false ? 'loading' : project.releaseInProgress ? 'release-in-progress' : project.updateRequired ? 'update-available' : 'no-updates'}">
		<div class="card-actions">
			<button
				class="refresh-button"
				title="click to refresh this project. doubleclick to refresh dependencies"
				onclick={() => refreshProject(project, { refreshDependencies: false })}
				ondblclick={() => refreshProject(project, { skipSelf: true })}>⟳</button>
			{#if computeTiers(projects.filter(p => p.releaseLine.name === project.releaseLine.name), projects).findIndex(t => t.projects.includes(project)) > 0}
				<button
					class="focus-button"
					title="Ignore all projects in previous tiers that are not dependencies of this project"
					onclick={() => focusProject(project)}
				>📥</button>
			{/if}
			<input
				class="include-checkbox"
				type="checkbox"
				title={project.ignored ? 'Include this project' : 'Exclude this project'}
				checked={!project.ignored}
				onchange={() => { project.ignored = !project.ignored; projects = projects; }}
			/>
		</div>
		<h2 class="project-title">
			<span class="status-icon"></span>
			<a
				target="_blank"
				href="https://github.com/{project?.repository.owner}/{project?.repository?.repository}/tree/{project?.releaseLine.branch}"
				>{project.name.replace('@rokucommunity/', '')}</a
			>
		</h2>
		<div class="version-row">
			<span class="version-links">
				<a
					target="_blank"
					href="https://github.com/{project?.repository.owner}/{project?.repository
						?.repository}/releases/tag/v{project.currentVersion}"><i>v{project.currentVersion}</i></a
				>
				{#if project.projectType === 'npm'}
					<a
						class="npm-link"
						target="_blank"
						href="https://www.npmjs.com/package/{project.name.toLowerCase()}"
						aria-label="View {project.name} on npm"
					>
						<svg viewBox="0 0 128 128" width="18" height="18" aria-hidden="true">
							<path
								fill="#cb3837"
								d="m0 7.0624c0-3.8376 3.2248-7.0624 7.0624-7.0624h113.88c3.8376 0 7.0624 3.2248 7.0624 7.0624v113.88c0 3.8376-3.2248 7.0624-7.0624 7.0624h-113.88c-3.8376 0-7.0624-3.2248-7.0624-7.0624zm23.69 97.518h40.395l0.04975-58.532h19.494l-0.04975 58.581h19.543l0.0508-78.075-78.076-0.0995-0.0995 78.125z"
							/>
							<path
								fill="#fff"
								d="m25.105 65.52v-39.008h15.855c8.7201 0 26.274 0.03373 39.008 0.07496l23.153 0.07496v77.866h-19.476v-58.54h-19.588v58.54h-38.952z"
							/>
						</svg>
					</a>
				{/if}
				{#if project.vscodeExtensionId}
					<a
						class="vscode-link"
						target="_blank"
						href="https://marketplace.visualstudio.com/items?itemName={project.vscodeExtensionId}"
						aria-label="View {project.name} on the VS Code Marketplace"
					>
						<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
							<path
								fill="#0066B8"
								d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"
							/>
						</svg>
					</a>
				{/if}
				<a
					class="status-badge status-badge-{project.ciStatus ?? 'unknown'}"
					target="_blank"
					href={getSecurityAuditRunsUrl(project)}
					title={`Security audit on ${project.releaseLine.branch} (${project.ciStatus ?? 'unknown'})`}
					aria-label={`Security audit on ${project.releaseLine.branch}: ${project.ciStatus ?? 'unknown'}`}
				>
					<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
						<rect x="3" y="8" width="10" height="7" rx="1" fill="white" />
						<path d="M5 8V5a3 3 0 0 1 6 0v3" fill="none" stroke="white" stroke-width="2" />
					</svg>
				</a>
			</span>
			<a
				class="button release-status-button"
				onclick={() => toggleProjectUpdateActive(project)}
				target="_blank"
				title={project.releaseInProgress
					? `A release for v${project.releaseInProgress.version} is already open — no need to start a new one. Click to view it.`
					: undefined}
				href={project.releaseInProgress
					? project.releaseInProgress.url
					: `https://github.com/${project?.repository.owner}/${project?.repository.repository}/actions/workflows/initialize-release.yml`}
			>
				{#if project.loadFailed}
					Load failed
				{:else if project.isLoading !== false}
					pending
				{:else if project.releaseInProgress}
					View open release{project.releaseInProgress.prNumber ? ` #${project.releaseInProgress.prNumber}` : ''} →
				{:else if project.updateRequired}
					Start release
				{:else}
					Up to date
				{/if}
				{#if project.updateRequired && !project.releaseInProgress}
					<div class="update-actions {selectedProjectForUpdate === project ? '' : 'hidden'}">
						<button class="button major" onclick={() => dispatchRelease(project)}>major</button>
						<button class="button minor" onclick={() => dispatchRelease(project)}>minor</button>
						<button class="button patch" onclick={() => dispatchRelease(project)}>patch</button>
						<button class="button prerelease" onclick={() => dispatchRelease(project)}>prerelease</button>
					</div>
				{/if}
			</a>
		</div>

		<!-- release-in-progress banner: tell the user a release is already open so they don't start a new one -->
		{#if project.releaseInProgress}
			<a class="release-in-progress-banner" href={project.releaseInProgress.url} target="_blank">
				<span class="release-in-progress-icon" aria-hidden="true">🚀</span>
				<span class="release-in-progress-text">
					Release <b>v{project.releaseInProgress.version}</b> already in progress{project.releaseInProgress.prNumber
						? ` (PR #${project.releaseInProgress.prNumber})`
						: ''} — no need to start a new one.
				</span>
			</a>
		{/if}

		<!-- unreleased commits-->
		<div class="unreleased-commits">
			<h3>
				<a
					target="_blank"
					href={`https://github.com/${project.repository.owner}/${project.repository.repository}/compare/v${project.currentVersion}...${project.releaseLine.branch}`}
					>Code changes:
				</a>
			</h3>
			<ul>
				{#if !project.unreleasedCommits}
					<li class="commits-not-fetched"><i>&lt;Commits not fetched&gt;</i></li>
				{:else if project.unreleasedCommits?.length === 0}
					<li class="faded"><i>No unreleased commits</i></li>
				{:else}
					{@const commits = getFilteredProjectCommits(project)}
					{#each commits as commit}
						<li
							class={commit.commit.message.startsWith('chore') || commit.commit.message.startsWith('(chore)')
								? 'commit-chore'
								: ''}
						>
							<a class="commit-link" target="_blank" href={commit.html_url} title={commit.commit.message}>
								{commit.commit.message}
							</a>
						</li>
					{/each}
					{#if (project.unreleasedCommits?.length ?? 0) > MAX_COLLAPSED_COMMITS}
						<li>
							<button class="show-more faded" onclick={() => toggleProjectShowAllCommits(project)}
								>...show {project?.showAllCommits ? 'less' : `${project.unreleasedCommits.length - commits.length} more`}</button
							>
						</li>
					{/if}
				{/if}
			</ul>
		</div>

		<!-- dependencies list -->
		<h3>Dependencies:</h3>
		<ul class="dependencies">
			{#if project.dependencies.length > 0}
				{#each project.dependencies as dependency}
					{@const dProject = findDependency(dependency)!}
					{@const dependencyVersionIsDifferent = dProject?.currentVersion !== dependency?.versionFromLatestRelease}
					{@const panelKey = getDependencyChangesKey(project, dependency)}
					{@const isExpanded = expandedDependencyChanges[panelKey] ?? false}
					{@const cacheKey = dProject && dependency.versionFromLatestRelease && dProject.currentVersion ? getDependencyCommitsCacheKey(dProject, dependency.versionFromLatestRelease, dProject.currentVersion) : null}
					{@const depCommits = cacheKey ? dependencyChangesCache[cacheKey] : undefined}
					<li class={[{ 'dep-old': dependencyVersionIsDifferent }]}>
						<div class="dependency-container">
							<a
								target="_blank"
								class="dependency-name"
								title={dependency.name}
								href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}/tree/${dProject?.releaseLine.branch}`}
							>
								{dependency.name.replace('@rokucommunity/', '')}
							</a>@{#if dependencyVersionIsDifferent}<a
									class="dependency-version-link"
									target="_blank"
									href={`https://github.com/${dProject.repository.owner}/${dProject.repository.repository}/compare/v${dependency.versionFromLatestRelease}...${dProject.releaseLine.branch}`}
								>
									<span class="dependency-start-version">{dependency?.versionFromLatestRelease}&nbsp;⇒&nbsp;</span><span
										class="dependency-end-version {dependency.versionFromTipOfReleaseLine === dProject.currentVersion
											? 'dep-is-ready'
											: ''}">{dProject?.currentVersion}</span
									>
								</a>{:else}<a
									target="_blank"
									href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}/releases/tag/v${dProject?.currentVersion}`}
									>{dProject?.currentVersion}</a
								>{/if}
							{#if dependencyVersionIsDifferent && dProject}
								<button
									class="dep-changes-toggle"
									title={isExpanded ? 'Hide changes' : 'Show changes'}
									onclick={() => toggleDependencyChanges(project, dependency)}
								>{isExpanded ? '▲' : '▼'}</button>
							{/if}
						</div>
						{#if dependencyVersionIsDifferent && dProject && isExpanded}
							<div class="dep-changes-panel">
								{#if depCommits === null}
									<span class="faded"><i>Loading...</i></span>
								{:else if depCommits === undefined}
									<span class="faded"><i>Not fetched</i></span>
								{:else if depCommits.length === 0}
									<span class="faded"><i>No commits found</i></span>
								{:else}
									<ul class="dep-changes-list">
										{#each depCommits as commit}
											<li class={commit.commit.message.startsWith('chore') || commit.commit.message.startsWith('(chore)') ? 'commit-chore' : ''}>
												<a class="commit-link" target="_blank" href={commit.html_url} title={commit.commit.message}>
													{commit.commit.message}
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			{:else}
				<li class="faded"><i>No dependencies</i></li>
			{/if}
		</ul>
		<div class="releaseline-tag">{project.releaseLine.name}</div>
	</div>
{/snippet}

<main>
	<header class="navbar">
		<div class="navbar-left">
			<a class="navbar-logo" href="https://github.com/rokucommunity/release-tracker" title="View this project on GitHub" target="_blank">
				<img src="github-mark-white.png" alt="GitHub" width="28" height="28" />
			</a>
			<h1>RokuCommunity Release Tracker</h1>
		</div>
		<div class="navbar-actions">
			<div class="view-switch" onclick={() => setViewMode(viewMode === 'default' ? 'release-flow' : 'default')} role="switch" aria-checked={viewMode === 'release-flow'}>
				<span class="view-switch-option view-switch-default {viewMode === 'default' ? 'active' : ''}">Default</span>
				<span class="view-switch-option view-switch-flow {viewMode === 'release-flow' ? 'active' : ''}">Release Flow</span>
			</div>
			<div class="user-menu-container">
				<button class="user-menu-button {githubToken ? 'authenticated' : ''}" onclick={() => showUserMenu = !showUserMenu}>
					<svg class="user-menu-avatar" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2a7.2 7.2 0 0 1-6-3.22c.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08a7.2 7.2 0 0 1-6 3.22z"/>
					</svg>
				</button>
				{#if showUserMenu}
					<div class="user-menu-backdrop" onclick={() => showUserMenu = false}></div>
					<div class="user-menu">
						{#if githubToken}
							<div class="user-menu-status">Authenticated</div>
							<button class="user-menu-item" onclick={() => { signOut(); showUserMenu = false; }}>Sign out</button>
							<button class="user-menu-item" onclick={() => { showTokenInput = true; showUserMenu = false; }}>Change token</button>
						{:else}
							<div class="user-menu-status">Not signed in</div>
							<button class="user-menu-item" onclick={() => { showTokenInput = true; showUserMenu = false; }}>Sign in</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</header>
	<div class="content">
		{#each releaseLines as releaseLine}
			<div class="releaseline-container {getReleaseLineClass(releaseLine)} {collapsedReleaseLines[releaseLine] ? 'collapsed' : 'expanded'}">
				<h2 class="releaseline-header" onclick={() => toggleReleaseLineCollapsed(releaseLine)}>{releaseLine}</h2>

				{#if viewMode === 'default'}
					<div class="cards-container">
						{#each projects.filter((x) => x.releaseLine.name === releaseLine) as project}
							{@render projectCard(project)}
						{/each}
					</div>
				{:else}
					{@const releaseLineProjects = projects.filter((x) => x.releaseLine.name === releaseLine)}
					{@const tiers = computeTiers(releaseLineProjects, projects)}
					{#each tiers as tierData, tierIndex}
						{@const status = getTierStatus(releaseLine, tierIndex, tiers)}
						<div class="tier-container tier-{status}">
							<div class="tier-header">
								<span class="tier-label">Tier {tierData.tier + 1}</span>
								<span class="tier-status">{getTierStatusLabel(status)}</span>
							</div>
							<div class="cards-container">
								{#each tierData.projects as project}
									{@render projectCard(project)}
								{/each}
							</div>
						</div>
					{/each}
				{/if}

				<div class="expand-button-container">
					<i class="expand-button" onclick={() => toggleReleaseLineCollapsed(releaseLine)}>Show all projects</i>
				</div>
			</div>
		{/each}
	</div>
	{#if showTokenInput}
		<div class="modal-backdrop" onclick={() => showTokenInput = false}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<button class="modal-close" onclick={() => showTokenInput = false}>x</button>
				{#if githubToken}
					<h2>GitHub Authentication</h2>
					<p>You're currently authenticated. API rate limit: 5,000 requests/hour.</p>
					<div class="modal-actions">
						<button class="auth-button modal-signout" onclick={() => { signOut(); showTokenInput = false; }}>Remove token</button>
					</div>
				{:else}
					<h2>Sign in with GitHub</h2>
					<p>
						A Personal Access Token (PAT) gives this app authenticated access to the GitHub API,
						raising the rate limit from 60 to 5,000 requests per hour.
					</p>
					<p>Your token is stored only in your browser's localStorage and is never sent anywhere except to the GitHub API.</p>
					<ol>
						<li>
							<a href="https://github.com/settings/tokens/new?description=RokuCommunity+Release+Tracker&scopes=public_repo" target="_blank">
								Click here to create a new PAT on GitHub
							</a>
							(no scopes needed for public repos -- the defaults are fine)
						</li>
						<li>Copy the generated token</li>
						<li>Paste it below and click Apply</li>
					</ol>
					<div class="modal-input-row">
						<input
							class="token-input"
							type="password"
							placeholder="ghp_xxxxxxxxxxxx"
							onkeydown={(e) => {
								if (e.key === 'Enter') {
									saveGithubToken(e.currentTarget.value);
									showTokenInput = false;
								}
							}}
						/>
						<button class="auth-button modal-apply" onclick={(e) => {
							const input = e.currentTarget.parentElement?.querySelector('input');
							if (input?.value) {
								saveGithubToken(input.value);
								showTokenInput = false;
							}
						}}>Apply</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</main>

<style>
	:root {
		interpolate-size: allow-keywords;
	}

	.content {
		margin: 8px;
	}

	.expand-button:hover {
		font-style: italic;
		text-decoration: underline;
		cursor: pointer;
	}
	.expanded .expand-button-container {
		display: none !important;
	}

	.expand-button-container {
		text-align: center;
	}

	.show-more {
		background-color: transparent;
		border: none;
		font-style: italic;
		color: rgb(217, 217, 217);
		padding: 0;
	}

	.show-more:hover {
		text-decoration: underline;
	}

	.refresh-button {
		background-color: transparent;
		border: none;
		color: rgb(180, 180, 180);
		cursor: pointer;
		font-size: 1.1rem;
		padding: 0;
		line-height: 1;
	}

	.refresh-button:hover {
		color: #fd7e14;
	}

	ul {
		margin-block-start: 0;
		margin-block-end: 0;
		margin-left: 13px;
	}

	.commit-chore {
		list-style-type: circle;
	}

	.commit-chore .commit-link {
		color: #888;
	}

	.commit-link {
		max-width: 290px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: inline-block;
		vertical-align: middle;
	}

	.navbar {
		background-color: rgba(0, 0, 0, 0);
		color: rgb(217, 217, 217);
		padding: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.no-updates .button {
		cursor: default !important;
	}

	.release-status-button {
		position: relative;
	}

	.card.loading {
		animation: pulse-opacity 1.2s;
	}

	.loading .release-status-button {
		background-color: rgba(0, 0, 0, 0.24) !important;
		color: grey !important;
	}

	.no-updates .release-status-button {
		background-color: rgba(0, 0, 0, 0.24) !important;
		color: green !important;
	}

	.failed .release-status-button {
		background-color: rgba(220, 53, 69, 0.2) !important;
		color: #dc3545 !important;
		cursor: default;
	}

	.update-available .release-status-button {
		background-color: #fd7e14 !important;
		color: white;
	}

	.release-in-progress .release-status-button {
		background-color: #6f42c1 !important;
		color: white;
	}

	.release-in-progress-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 8px 0;
		padding: 8px 10px;
		border: 1px solid #6f42c1;
		border-left: 4px solid #6f42c1;
		border-radius: 4px;
		background-color: rgba(111, 66, 193, 0.12);
		color: inherit;
		text-decoration: none;
		font-size: 0.85rem;
		line-height: 1.3;
	}

	.release-in-progress-banner:hover {
		background-color: rgba(111, 66, 193, 0.22);
	}

	.release-in-progress-icon {
		flex: 0 0 auto;
		font-size: 1.1rem;
	}

	.release-in-progress-text b {
		color: #b794f6;
	}

	.update-available .update-actions {
		background-color: #3d5369;
		border: 1px solid #717171;
		position: absolute;
		z-index: 1;
		top: 200%;
		left: 50%;
		transform: translate(-50%, -50%);
		padding: 10px;
		display: flex;
		gap: 0.5rem;
		border-radius: 4px;
		box-shadow: 8px 8px 15px rgba(0, 0, 0, 0.8);
	}

	.update-available .update-actions::before {
		content: '';
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-bottom: 8px solid #3d5369;
	}

	.navbar h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	a:hover {
		text-decoration: underline;
	}

	a,
	a:visited {
		color: rgb(158, 158, 255);
		text-decoration: none;
	}

	.cards-container {
		display: grid;
		grid-template-columns: repeat(auto-fit, 350px);
		gap: 1rem;
		justify-content: center;
		padding: 0 2rem;
		overflow: hidden;
		transition: all 0.18s ease-in-out;
	}

	.card {
		box-sizing: border-box;
		border: 2px solid rgba(255, 255, 255, 0.15);
		border-style: inset;
		border-radius: 8px;
		padding: 1rem;
		padding-top: 1.5rem;
		border-style: inset;
		/* min-width: 300px; */
		width: 350px;
		word-wrap: break-word;
		position: relative;
	}

	.card h2 {
		margin: 0;
		padding: 0;
	}

	.card a {
		color: rgb(217, 217, 217);
	}

	.card h3 {
		margin: 1rem 0 0.5rem;
		font-size: 1rem;
		color: rgb(217, 217, 217);
	}

	.card ul {
		padding-left: 1rem;
		list-style-type: disc;
	}

	.card ul li {
		margin-bottom: 0.5rem;
	}

	.version-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin: 0;
		padding: 0;
	}

	.version-links {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 18px;
		border-radius: 3px;
		background-color: #9f9f9f;
		line-height: 1;
		text-decoration: none;
	}

	.status-badge:hover {
		text-decoration: none;
		filter: brightness(1.1);
	}

	.status-badge-success { background-color: #4c1; }
	.status-badge-failure { background-color: #e05d44; }
	.status-badge-pending { background-color: #dfb317; }
	.status-badge-unknown { background-color: #9f9f9f; }

	.version-links .npm-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #cb3837;
		text-decoration: none;
		line-height: 1;
	}

	.version-links .npm-link svg {
		display: block;
	}

	.version-links .npm-link:hover {
		color: #a02d2c;
		text-decoration: none;
	}

	.version-links .vscode-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #0066b8;
		text-decoration: none;
		line-height: 1;
	}

	.version-links .vscode-link svg {
		display: block;
	}

	.version-links .vscode-link:hover {
		color: #00528f;
		text-decoration: none;
	}

	.update-available {
		position: relative;
	}

	.project-title {
		padding: 0;
		font-size: 1.25rem;
		display: flex;
		align-items: center;
		gap: 7px;
	}

	/* General Button Styles */
	button,
	.button {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: bold;
		color: white;
		text-align: center;
		display: inline-block;
		cursor: pointer;
	}

	.button:hover {
		background-image: linear-gradient(#0000, #0000000d 40%, #0000001a);
	}

	.button:active {
		border-color: #000;
		box-shadow:
			inset 0 0 0 1px #00000026,
			inset 0 0 6px #0003;
	}

	.button.major {
		background-color: #dc3545;
		color: white;
	}

	.button.minor {
		background-color: #007bff;
		color: white;
	}

	.button.patch {
		background-color: #28a745;
		color: white;
	}

	.button.prerelease {
		background-color: #fd7e14;
		color: white;
	}

	.status-icon {
		box-sizing: border-box;
		border-radius: 100%;
		width: 20px;
		height: 20px;
		display: inline;
	}

	.update-available .status-icon {
		background-color: #fd7e14;
		border: 2px solid #fd7e14;
	}

	.no-updates .status-icon {
		background-color: green;
	}

	.release-in-progress .status-icon {
		background-color: #6f42c1;
		border: 2px solid #6f42c1;
	}

	.loading .status-icon {
		background-color: grey;
		animation: pulse-opacity 1.2s infinite;
	}

	.failed .status-icon {
		background-color: #dc3545;
		border: 2px solid #dc3545;
	}

	@keyframes pulse-opacity {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
		100% {
			opacity: 1;
		}
	}

	.releaseline1 {
		--releaseline-card-bg: #1e2534;
		--releaseline-tag-bg: #134489;
	}

	.releaseline2 {
		--releaseline-card-bg: #271d2e;
		--releaseline-tag-bg: #57227d;
	}

	.releaseline3 {
		--releaseline-card-bg: #1e2e2e;
		--releaseline-tag-bg: #2b4c4c;
	}

	.releaseline-header {
		padding: 5px;
		border-radius: 4px;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		background-color: var(--releaseline-tag-bg);
		margin-top: 0;
		cursor: pointer;
	}

	.releaseline-container {
		border: 2px solid var(--releaseline-tag-bg);
		border-radius: 5px;
		padding-bottom: 10px;
		margin-bottom: 20px;
	}

	.collapsed .cards-container,
	.collapsed .tier-container {
		display: none;
	}

	.card {
		background-color: var(--releaseline-card-bg);
	}

	.releaseline-tag {
		background-color: var(--releaseline-tag-bg);
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		border-radius: 5px;
		padding-top: 0px;
		padding-bottom: 2px;
		padding-left: 5px;
		padding-right: 5px;
		font-size: 0.75rem;
		font-weight: bold;
		display: none;
	}

	.dependencies li,
	.dependencies li a,
	.faded {
		color: rgb(168, 168, 168);
	}

	.dep-old::marker,
	.dep-old > .dependency-container a {
		color: #fd7e14 !important;
	}

	/* Style for whenever a dependency is up to date in the trunk (but that project has not yet released with that change) */
	.dep-is-ready {
		color: rgb(1, 183, 1) !important;
	}

	.dependency-container {
		display: flex;
		align-items: center;
	}

	.dependency-version-link {
		display: flex;
		flex-wrap: wrap;
	}

	.dependency-start-version {
		white-space: nowrap;
	}
	.dependency-end-version {
		white-space: nowrap;
	}

	.dep-changes-toggle {
		background: none;
		border: none;
		color: #fd7e14;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 4px 6px;
		opacity: 0.6;
		line-height: 1;
	}
	.dep-changes-toggle:hover {
		opacity: 1;
	}

	.dep-changes-panel {
		margin-top: 3px;
		padding: 4px 6px;
		border-left: 2px solid rgba(253, 126, 20, 0.4);
		margin-left: 4px;
		overflow: hidden;
	}

	.dep-changes-list {
		list-style: disc;
		padding-left: 1.2em;
		margin: 0;
	}

	.dep-changes-panel li,
	.dep-changes-panel li a {
		color: rgb(217, 217, 217);
	}

	.dep-changes-panel .commit-link {
		max-width: 100%;
	}

	.commits-not-fetched {
		color: #dc3545;
	}

	/* View switch */
	.navbar-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.view-switch {
		display: flex;
		background-color: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		padding: 2px;
		cursor: pointer;
		user-select: none;
	}

	.view-switch-option {
		padding: 0.3rem 0.7rem;
		border-radius: 4px;
		font-size: 0.8rem;
		color: rgba(217, 217, 217, 0.5);
		transition: all 0.15s ease;
	}

	.view-switch-default.active {
		background-color: rgba(100, 140, 180, 0.35);
		color: #a8cef0;
		font-weight: bold;
	}

	.view-switch-flow.active {
		background-color: rgba(76, 175, 80, 0.3);
		color: #81c784;
		font-weight: bold;
	}

	/* Release flow tier styles */
	.tier-container {
		margin: 0.75rem 1rem;
		border-radius: 6px;
		overflow: hidden;
		border-left: 4px solid var(--tier-accent);
		border-top: 1px solid var(--tier-border);
		border-right: 1px solid var(--tier-border);
		border-bottom: 1px solid var(--tier-border);
	}

	.tier-ready {
		--tier-accent: #4caf50;
		--tier-border: rgba(76, 175, 80, 0.3);
		--tier-header-bg: rgba(76, 175, 80, 0.12);
		--tier-label-color: #4caf50;
	}

	.tier-blocked {
		--tier-accent: #fd7e14;
		--tier-border: rgba(253, 126, 20, 0.3);
		--tier-header-bg: rgba(253, 126, 20, 0.12);
		--tier-label-color: #fd7e14;
	}

	.tier-pending {
		--tier-accent: #888;
		--tier-border: rgba(136, 136, 136, 0.25);
		--tier-header-bg: rgba(136, 136, 136, 0.08);
		--tier-label-color: #999;
	}

	.tier-done {
		--tier-accent: #555;
		--tier-border: rgba(85, 85, 85, 0.25);
		--tier-header-bg: rgba(85, 85, 85, 0.08);
		--tier-label-color: #777;
	}

	.tier-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		background-color: var(--tier-header-bg);
		border-bottom: 1px solid var(--tier-border);
	}

	.tier-label {
		font-weight: bold;
		font-size: 0.95rem;
		color: var(--tier-label-color);
	}

	.tier-status {
		font-size: 0.8rem;
		font-weight: bold;
		padding: 0.15rem 0.5rem;
		border-radius: 3px;
		color: var(--tier-label-color);
		background-color: var(--tier-header-bg);
	}

	.tier-container .cards-container {
		padding: 0.75rem;
	}

	/* Ignore button */
	.card-actions {
		position: absolute;
		top: 0.2rem;
		right: 0.3rem;
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}


	.focus-button {
		background-color: transparent;
		border: none;
		color: rgb(180, 180, 180);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 0;
		line-height: 1;
	}

	.focus-button:hover {
		color: #fd7e14;
	}

	.include-checkbox {
		cursor: pointer;
		margin: 0;
		width: 1rem;
		height: 1rem;
	}


	.ignored {
		opacity: 0.45;
	}

	.ignored .status-icon {
		background-color: #666;
	}

	.ignored .release-status-button {
		background-color: rgba(0, 0, 0, 0.24) !important;
		color: #888 !important;
	}

	/* Navbar layout */
	.navbar-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.navbar-logo {
		display: flex;
		align-items: center;
		opacity: 0.85;
	}

	.navbar-logo:hover {
		opacity: 1;
	}

	/* User menu */
	.user-menu-container {
		position: relative;
	}

	.user-menu-button {
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
		color: #999;
		transition: color 0.15s, border-color 0.15s;
	}

	.user-menu-button:hover {
		color: #ccc;
		border-color: rgba(255, 255, 255, 0.35);
	}

	.user-menu-button.authenticated {
		color: #4caf50;
		border-color: rgba(76, 175, 80, 0.4);
	}

	.user-menu-button.authenticated:hover {
		color: #66bb6a;
		border-color: rgba(76, 175, 80, 0.6);
	}

	.user-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	.user-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		background-color: #1e2534;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		padding: 0.4rem 0;
		min-width: 150px;
		z-index: 50;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}

	.user-menu-status {
		padding: 0.4rem 0.75rem;
		font-size: 0.75rem;
		color: #888;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		margin-bottom: 0.2rem;
	}

	.user-menu-item {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		color: rgb(217, 217, 217);
		padding: 0.4rem 0.75rem;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.user-menu-item:hover {
		background-color: rgba(255, 255, 255, 0.08);
	}

	.auth-button {
		background-color: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgb(217, 217, 217);
		padding: 0.25rem 0.6rem;
		border-radius: 4px;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.auth-button:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
	}

	.modal-signout {
		border-color: rgba(220, 53, 69, 0.4);
		color: #dc3545;
	}

	.modal-signout:hover {
		background-color: rgba(220, 53, 69, 0.15);
	}

	.token-input {
		background-color: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.25);
		color: rgb(217, 217, 217);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.8rem;
		width: 180px;
	}

	.token-input:focus {
		outline: none;
		border-color: rgba(100, 140, 180, 0.6);
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background-color: #1e2534;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		padding: 1.5rem 2rem;
		max-width: 480px;
		width: 90%;
		position: relative;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
		color: rgb(217, 217, 217);
	}

	.modal h2 {
		margin: 0 0 1rem;
		font-size: 1.2rem;
	}

	.modal p {
		font-size: 0.9rem;
		line-height: 1.5;
		margin: 0 0 0.75rem;
		color: rgb(180, 180, 180);
	}

	.modal ol {
		font-size: 0.9rem;
		line-height: 1.6;
		padding-left: 1.25rem;
		margin: 0 0 1.25rem;
		color: rgb(200, 200, 200);
	}

	.modal ol a {
		color: rgb(158, 158, 255);
	}

	.modal-close {
		position: absolute;
		top: 0.5rem;
		right: 0.75rem;
		background: none;
		border: none;
		color: rgb(180, 180, 180);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
	}

	.modal-close:hover {
		color: white;
	}

	.modal-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.modal-input-row .token-input {
		flex: 1;
		width: auto;
	}

	.modal-apply {
		white-space: nowrap;
	}
</style>
