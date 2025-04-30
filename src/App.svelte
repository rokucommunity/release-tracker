<script lang="ts">
	import { Octokit, App } from 'octokit';
	import { type Project, getAllProjects } from './projects';

	let projects = getAllProjects();

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
						<div class="button {project.updateRequired ? 'danger' : 'success'}">
							{project.updateRequired ? 'Update Required' : 'Up-to-date'}
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
	}

	/* Success Button (Green) */
	.button.success {
		background-color: #3f844f;
	}

	/* Danger Button (Red) */
	.button.danger {
		background-color: #a2303b;
	}
</style>
