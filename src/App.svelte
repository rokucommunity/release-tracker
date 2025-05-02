<script lang="ts">
	import { Octokit, App } from 'octokit';
	import { type Project, getAllProjects } from './projects';
	import { hasContext } from 'svelte';
	import { createClassFactory, sleep } from './util';
	import { http } from './http';

	const enableTestMode = false;

	let projects = getAllProjects();

	const getBranchClass = createClassFactory(['branch1', 'branch2', 'branch3', 'branch4', 'branch5', 'branch6', 'branch7']);

	/**
	 * When clicking on a project's "update required" button, this is the project you clicked the button for.
	 */
	let selectedProjectForUpdate: Project | undefined;

	const octokit = new Octokit();

	async function hydrateProject(project: Project) {
		project.isLoading = true;

		//temporarily generate dummy data for testing purposes instead of hitting the API
		if (enableTestMode) {
			await sleep(Math.random() * 1000);

			//generate a random semver version
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
			for (const dep of project.dependencies) {
				dep.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;
			}
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;

			project.isLoading = false;
			return;
		}

		//TODO fetch list of open PRs and add links for open release PRs

		console.log(`Hydrating ${project.name}`);

		//fetch head package
		const response = await http.get({
			url: `https://raw.githubusercontent.com/${project.repository.owner}/${project.repository.repository}/refs/heads/${project.branch}/package.json`,
			//prevent caching of this package.json since it could change at any time
			cacheBusting: true
		});
		const packageJson = JSON.parse(response);
		project.currentVersion = packageJson.version;

		//fetch most recent release package-lock.json
		const tagResponse = await http.get({
			url: `https://raw.githubusercontent.com/${project.repository.owner}/${project.repository.repository}/refs/tags/v${packageJson.version}/package-lock.json`,
			//this request can be cached since files from tag refs should never change
			cacheInLocalStorage: true
		});
		const tagPackageLockJson = JSON.parse(tagResponse);

		//now update the dependencies
		for (const dependency of project.dependencies) {
			dependency.currentVersion ??= tagPackageLockJson?.packages?.[`node_modules/${dependency.name}`]?.version;
		}

		//fetch the latest patch file

		project.isLoading = false;
	}

	function computeProjectNeedsUpdate(project: Project) {
		// Compute whether an update is required
		project.updateRequired = !project.dependencies.every((dep) => {
			const dProject = projects.find((x) => x.name === dep.name);
			return !dProject?.currentVersion || dProject.currentVersion === dep.currentVersion;
		});
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

	async function hydrateAllProjects() {
		//sort the projects so that dependency projects are always hydrated before the projects that depend on them
		const sortedProjects = [...projects].sort((a, b) => {
			const aDependencies = a.dependencies.map((x) => x.name);
			const bDependencies = b.dependencies.map((x) => x.name);
			if (aDependencies.includes(b.name)) {
				return 1;
			}
			if (bDependencies.includes(a.name)) {
				return -1;
			}
			return 0;
		});
		for (const project of sortedProjects) {
			await hydrateProject(project);
			computeProjectNeedsUpdate(project);
			//trigger reactivity after every project hydration
			projects = projects;
		}

		//do another pass to ensure all projects are up to date
		for (const project of projects) {
			computeProjectNeedsUpdate(project);
		}
		projects = projects;
	}

	//temporarily only keep one of the projects to keep our rate limit down during testing
	// projects = projects.filter((x) => ['roku-deploy'].includes(x.name));

	hydrateAllProjects();
</script>

<main>
	<header class="navbar">
		<h1>RokuCommunity Release Tracker</h1>
	</header>
	<div class="content">
		<div class="cards-container">
			{#each projects as project}
				<div
					class="card {project.isLoading !== false
						? 'loading'
						: project.updateRequired
							? 'update-available'
							: 'no-updates'} {getBranchClass(project.branch)}"
				>
					<h2 class="project-title">
						<span class="status-icon"></span>
						{project.name.replace('@rokucommunity/', '')}
					</h2>
					<div class="version-row">
						<span>
							<i>v{project.currentVersion}</i>
						</span>
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
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
					<h3>Dependencies:</h3>
					<ul class="dependencies">
						{#if project.dependencies.length > 0}
							{#each project.dependencies as dependency}
								{@const dProject = projects.find((x) => x.name === dependency.name)}
								{@const dependencyVersionIsDifferent = dProject?.currentVersion !== dependency?.currentVersion}
								<li class={[{ 'dep-old': dependencyVersionIsDifferent }]}>
									<a target="_blank" href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}`}>
										{dependency.name}
									</a>@<a
										target="_blank"
										href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}/releases/tag/v${dependency?.currentVersion}`}
									>
										{dependency?.currentVersion}
									</a>
									{#if dependencyVersionIsDifferent}
										<span class="arrow">⇒</span>
										<a
											target="_blank"
											class="new-version"
											href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}/releases/tag/v${dProject?.currentVersion}`}
											>{dProject?.currentVersion}
										</a>
									{/if}
								</li>
							{/each}
						{:else}
							<li><i>No dependencies</i></li>
						{/if}
					</ul>
					<div class="branch-name">{project.branch}</div>
				</div>
			{/each}
		</div>
	</div>
</main>

<style>
	.content {
		margin: 8px;
	}
	/* Navbar Styles */
	.navbar {
		background-color: rgb(88, 27, 152);
		color: white;
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

	a,
	a:visited {
		color: rgb(158, 158, 255);
		text-decoration: none;
	}

	.cards-container {
		display: grid; /* Use CSS Grid */
		grid-template-columns: repeat(auto-fit, 350px); /* Fixed card width */
		gap: 1rem; /* Space between cards */
		justify-content: center; /* Center the grid horizontally */
		padding: 0 2rem; /* Add padding to the left and right */
	}

	.card {
		box-sizing: border-box;
		border: 2px solid grey;
		border-radius: 8px;
		padding: 1rem;
		padding-top: 1.5rem;
		/* min-width: 300px; */
		width: 350px;
		background-color: #1e2934;
		word-wrap: break-word;
		position: relative;
	}

	.card h2 {
		margin: 0;
		padding: 0;
	}

	.card h3 {
		margin: 1rem 0 0.5rem;
		font-size: 1rem;
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

	.branch-name {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		border-radius: 5px;
		padding-top: 0px;
		padding-bottom: 2px;
		padding-left: 5px;
		padding-right: 5px;
		font-size: 0.75rem;
	}

	.branch1 .branch-name {
		background-color: #1666d6;
	}

	.dependencies li,
	.dependencies li a {
		color: rgb(168, 168, 168);
	}

	.dep-old::marker,
	.dep-old a,
	.dep-old .new-version {
		color: #fd7e14 !important;
	}
</style>
