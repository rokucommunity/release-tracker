<script lang="ts">
	import { Octokit, App } from 'octokit';
	import { type Project, getAllProjects } from './projects';

	let projects = getAllProjects();

	/**
	 * When clicking on a project's "update required" button, this is the project you clicked the button for.
	 */
	let selectedProjectForUpdate: Project | undefined;

	const octokit = new Octokit({});

	async function hydrateProject(project: Project) {
		//TODO fetch list of open PRs and add links for open release PRs

		console.log(`Hydrating ${project.name}`);
		//fetch the current package.json from the master branch
		const response = await octokit.rest.repos.getContent({
			mediaType: {
				format: 'raw'
			},
			owner: project.repository.owner,
			repo: project.repository.repository,
			path: 'package.json'
		});
		const packageJson = JSON.parse((response as any).data);
		project.currentVersion = packageJson.version;

		//now fetch the package.json from the latest release
		const tagResponse = await octokit.rest.repos.getContent({
			mediaType: {
				format: 'raw'
			},
			owner: project.repository.owner,
			repo: project.repository.repository,
			path: 'package.json',
			ref: `tags/v${packageJson.version}`
		});
		const tagPackageJson = JSON.parse((tagResponse as any).data);

		//now update the dependencies
		for (const dependency of project.dependencies) {
			if (tagPackageJson?.dependencies?.[dependency?.name]) {
				dependency.currentVersion = tagPackageJson.dependencies[dependency.name];
			}
		}
	}

	async function hydrateAllProjects() {
		for (const project of projects) {
			//temporarily generate dummy data for testing purposes instead of hitting the API
			//generate a random semver version
			project.currentVersion = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 10)}`;

			// await hydrateProject(project);
		}

		for (const project of projects) {
			computeProjectNeedsUpdate(project);
		}
		projects = projects;
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
		if (selectedProjectForUpdate === project) {
			selectedProjectForUpdate = undefined;
		} else {
			selectedProjectForUpdate = project;
		}
	}

	//temporarily only keep one of the projects to keep our rate limit down during testing
	// projects = projects.filter((x) => ['brighterscript', 'roku-deploy'].includes(x.name));

	hydrateAllProjects();
</script>

<main>
	<header class="navbar">
		<h1>RokuCommunity Release Tracker</h1>
	</header>
	<div class="content">
		<p>This is a list of all the projects in the RokuCommunity and their dependencies.</p>
		<div class="cards-container">
			{#each projects as project}
				<div class="card">
					<h2 class="project-title">
						{#if project.name.startsWith('@')}
							<span class="prefix">{project.name.split('/')[0]}/</span>
						{/if}
						<span class="main-title">{project.name.replace('@rokucommunity/', '')}</span>
					</h2>
					<div class="version-row">
						<span>
							Version: {project.currentVersion}
						</span>
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div
							class="button {project.updateRequired ? 'danger update-required' : 'success'}"
							on:click={() => toggleProjectUpdateActive(project)}
						>
							{project.updateRequired ? 'Update Required' : 'Up-to-date'}
							<div class="update-actions {selectedProjectForUpdate === project ? '' : 'hidden'}">
								<button class="button major" on:click={() => dispatchRelease(project)}> major </button>
								<button class="button minor" on:click={() => dispatchRelease(project)}> minor </button>
								<button class="button patch" on:click={() => dispatchRelease(project)}> patch </button>
								<button class="button prerelease" on:click={() => dispatchRelease(project)}> prerelease </button>
							</div>
						</div>
					</div>
					{#if project.dependencies.length > 0}
						<h3>Dependencies:</h3>
						<ul>
							{#each project.dependencies as dependency}
								{@const dProject = projects.find((x) => x.name === dependency.name)}
								<li>
									<a target="_blank" href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}`}>
										{dependency.name}
									</a>@{dependency.currentVersion} (v{dProject?.currentVersion} available)
								</li>
							{/each}
						</ul>
					{/if}
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

	.navbar h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	a,
	a:visited {
		text-decoration: none;
		color: white;
	}

	.cards-container {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1rem;
	}

	.card {
		box-sizing: border-box;
		border: 2px solid grey;
		border-radius: 8px;
		padding: 1rem;
		padding-top: 1.5rem;
		background-color: #1e2934;
		width: 300px;
		word-wrap: break-word;
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

	.update-required {
		position: relative; /* Parent must have `position: relative` */
	}

	.update-required .update-actions {
		position: absolute;
		top: 200%;
		left: 50%;
		transform: translate(-50%, -50%);
		background-color: grey;
		padding: 10px;
		display: flex;
		gap: 0.5rem;
		border-radius: 4px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.update-required .update-actions::before {
		content: '';
		position: absolute;
		bottom: 100%; /* Position the caret above the tooltip */
		left: 50%; /* Center the caret horizontally */
		transform: translateX(-50%); /* Adjust for caret width */
		width: 0;
		height: 0;
		border-left: 8px solid transparent; /* Create the triangle */
		border-right: 8px solid transparent;
		border-bottom: 8px solid grey; /* Match the tooltip background color */
	}

	.project-title {
		position: relative;
		margin: 0;
		padding: 0;
		font-size: 1.25rem;
		line-height: 1.2;
	}

	.project-title .prefix {
		color: #888; /* Lighter grey for less significance */
		font-size: 0.9rem; /* Slightly smaller font size */
		position: absolute;
		top: -0.8rem; /* Offset higher */
		left: 0;
	}

	.project-title .main-title {
		display: inline-block;
		padding-bottom: 4px;
	}

	/* General Button Styles */
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

	/* Success Button (Green) */
	.button.success {
		background-color: #3f844f;
	}

	/* Danger Button (Red) */
	.button.danger {
		background-color: #a2303b;
	}

	.button.major {
		background-color: #dc3545; /* Red for major */
		color: white;
	}

	.button.minor {
		background-color: #007bff; /* Blue for minor */
		color: white;
	}

	.button.patch {
		background-color: #28a745; /* Green for patch */
		color: white;
	}

	.button.prerelease {
		background-color: #fd7e14; /* Orange for pre-release */
		color: white;
	}
</style>
