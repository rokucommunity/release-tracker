<script lang="ts">
	import { Octokit } from '@octokit/rest';
	import { throttling } from '@octokit/plugin-throttling';
	import { type Project, getAllProjects } from './projects';
	import { hasContext } from 'svelte';
	import { createClassFactory, sleep } from './util';
	import { http } from './http';

	const MAX_COLLAPSED_COMMITS = 4;

	const enableTestMode = false;
	const commitsDebugFilter = true ? ['brighterscript-formatter'] : [];

	let projects = getAllProjects().filter((x) => x.hide !== true);

	const releaseLines = [
		...projects.reduce((acc, project) => {
			acc.add(project.releaseLine.name);
			return acc;
		}, new Set<string>())
	];

	const getReleaseLineClass = createClassFactory(['releaseline1', 'releaseline2', 'releaseline3', 'releaseline4', 'releaseline5']);

	let collapsedReleaseLines: Record<string, boolean> = {};

	/**
	 * When clicking on a project's "update required" button, this is the project you clicked the button for.
	 */
	let selectedProjectForUpdate: Project | undefined;

	const MyOctokit = Octokit.plugin(throttling);
	const octokit = new MyOctokit({
		// auth: 'token ' + process.env.TOKEN,
		throttle: {
			onRateLimit: (retryAfter, options) => {
				octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`);

				// Retry twice after hitting a rate limit error, then give up
				if (options.request.retryCount <= 3) {
					console.log(`Retrying after ${retryAfter} seconds!`);
					return true;
				}
			},
			onSecondaryRateLimit: (retryAfter, options, octokit) => {
				// does not retry, only logs a warning
				octokit.log.warn(`Secondary quota detected for request ${options.method} ${options.url}`);
			}
		}
	});

	async function hydrateProject(project: Project) {
		project.isLoading = true;

		//temporarily generate dummy data for testing purposes instead of hitting the API
		if (enableTestMode) {
			await sleep(Math.random() * 1000);

			//generate a random semver version
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
			for (const dep of project.dependencies) {
				dep.versionFromLatestRelease = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
			}
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;

			project.isLoading = false;
			return;
		}

		//TODO fetch list of open PRs and add links for open release PRs

		console.log(`${project.name} (${project.releaseLine.branch}): hydrating project`);

		//fetch head package.json
		const response = await http.get({
			url: `https://raw.githubusercontent.com/${project.repository.owner}/${project.repository.repository}/refs/heads/${project.releaseLine.branch}/package-lock.json`,
			//prevent caching of this package.json since it could change at any time
			cacheBusting: true
		});
		const packageLockJson = JSON.parse(response);
		project.currentVersion = packageLockJson.version;
		//now update the dependencies
		for (const dependency of project.dependencies) {
			dependency.versionFromTipOfReleaseLine ??= packageLockJson?.packages?.[`node_modules/${dependency.name}`]?.version;
		}

		//fetch most recent release package-lock.json
		const tagResponse = await http.get({
			url: `https://raw.githubusercontent.com/${project.repository.owner}/${project.repository.repository}/refs/tags/v${packageLockJson.version}/package-lock.json`,
			//this request can be cached since files from tag refs should never change
			cacheInLocalStorage: true
		});
		const tagPackageLockJson = JSON.parse(tagResponse);

		project.unreleasedCommits = await fetchUnreleasedCommits(project);

		//now update the dependencies
		for (const dependency of project.dependencies) {
			dependency.versionFromLatestRelease ??= tagPackageLockJson?.packages?.[`node_modules/${dependency.name}`]?.version;
		}

		//fetch the latest patch file

		project.isLoading = false;
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
			const dProject = projects.find((x) => x.name === dep.name);
			return !dProject?.currentVersion || dProject.currentVersion === dep.versionFromLatestRelease;
		});
		//projects who don't yet have their commits fetched will always be marked as needing an update
		project.updateRequired = hasOutdatedDependencies || !project.unreleasedCommits || project.unreleasedCommits.length > 0;
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
		collapsedReleaseLines[releaseLine] = !collapsedReleaseLines[releaseLine];
		collapsedReleaseLines = collapsedReleaseLines;
	}

	/**
	 * Refreshes the project and all of its dependencies
	 */
	async function refreshProject(project: Project, handledProjects: Project[] = []) {
		//if we have already refreshed this project, don't do it again
		if (handledProjects.includes(project)) {
			return;
		}

		handledProjects.push(project);

		project.isLoading = true;

		projects = projects;

		//add a small timeout to let the UI show the loading state
		await sleep(300);

		//first refresh all of the project's dependencies
		for (const dependency of project.dependencies) {
			const dProject = findDependency(dependency);

			//if we aren't actively reloading this project, reload it now
			if (dProject) {
				await refreshProject(dProject, handledProjects);
			}
		}
		//now refresh this project
		await hydrateProject(project);

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
			refreshProject(project, handledProjects);
		}
	}

	//temporarily only keep one of the projects to keep our rate limit down during testing
	hydrateProjects();
</script>

<main>
	<header class="navbar">
		<h1>RokuCommunity Release Tracker</h1>
	</header>
	<div class="content">
		{#each releaseLines as releaseLine}
			<div class="releaseline-container {getReleaseLineClass(releaseLine)}">
				<h2 class="releaseline-header" on:click={() => toggleReleaseLineCollapsed(releaseLine)}>{releaseLine}</h2>
				<div class="cards-container {collapsedReleaseLines[releaseLine] ? 'collapsed' : ''}">
					{#each projects.filter((x) => x.releaseLine.name === releaseLine) as project}
						<div class="card {project.isLoading !== false ? 'loading' : project.updateRequired ? 'update-available' : 'no-updates'}">
							<button class="refresh-button" on:click={() => refreshProject(project)}>⟳</button>
							<h2 class="project-title">
								<span class="status-icon"></span>
								<a
									target="_blank"
									href="https://github.com/{project?.repository.owner}/{project?.repository?.repository}/tree/{project?.releaseLine.branch}"
									>{project.name.replace('@rokucommunity/', '')}</a
								>
							</h2>
							<div class="version-row">
								<span>
									<i>v{project.currentVersion}</i>
								</span>
								<a
									class="button release-status-button"
									on:click={() => toggleProjectUpdateActive(project)}
									target="_blank"
									href={`https://github.com/${project?.repository.owner}/${project?.repository.repository}/actions/workflows/initialize-release.yml`}
								>
									{#if project.isLoading !== false}
										pending
									{:else if project.updateRequired}
										Start release
									{:else}
										Up to date
									{/if}
									{#if project.updateRequired}
										<div class="update-actions {selectedProjectForUpdate === project ? '' : 'hidden'}">
											<button class="button major" on:click={() => dispatchRelease(project)}>major</button>
											<button class="button minor" on:click={() => dispatchRelease(project)}>minor</button>
											<button class="button patch" on:click={() => dispatchRelease(project)}>patch</button>
											<button class="button prerelease" on:click={() => dispatchRelease(project)}>prerelease</button>
										</div>
									{/if}
								</a>
							</div>

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
											<li>
												<a class="commit-link" target="_blank" href={commit.html_url} title={commit.commit.message}>
													{commit.commit.message}
												</a>
											</li>
										{/each}
										{#if (project.unreleasedCommits?.length ?? 0) > MAX_COLLAPSED_COMMITS}
											<li>
												<button class="show-more faded" on:click={() => toggleProjectShowAllCommits(project)}
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
											</div>
										</li>
									{/each}
								{:else}
									<li class="faded"><i>No dependencies</i></li>
								{/if}
							</ul>
							<div class="releaseline-tag">{project.releaseLine.name}</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</main>

<style>
	.content {
		margin: 8px;
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
		position: absolute;
		top: 0.1rem;
		right: 0.1rem;
		background-color: transparent;
		border: none;
		color: rgb(217, 217, 217);
		cursor: pointer;
		font-size: 1.25rem;
	}

	ul {
		margin-block-start: 0;
		margin-block-end: 0;
		margin-left: 13px;
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

	.update-available .release-status-button {
		background-color: #fd7e14 !important;
		color: white;
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

	.loading .status-icon {
		background-color: grey;
		animation: pulse-opacity 1.2s infinite;
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

	.collapsed {
		max-height: 0;
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
	.dep-old a {
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

	.commits-not-fetched {
		color: #dc3545;
	}
</style>
