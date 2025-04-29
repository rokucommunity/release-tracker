<script lang="ts">
	import { Octokit, App } from 'octokit';

	interface Project {
		/**
		 * The name of the project
		 */
		name: string;

		/**
		 * The current version of the project (as of the master branch latest package.json)
		 */
		currentVersion?: string;

		/**
		 * Whether an update is required for this project
		 */
		updateRequired?: boolean;

		/**
		 * The owner and repository name of the project on GitHub
		 */
		repository: {
			owner: string;
			repository: string;
		};
		/**
		 * List of other RokuCommunity dependencies this project depends on. This is used to determine the order of releases
		 * and to determine if a project needs a new release.
		 */
		dependencies: Array<{
			name: string;
			/**
			 * The version of the dependency that this project last released with
			 */
			currentVersion?: string;
		}>;
	}

	let projects: Project[] = [
		{
			name: 'roku-deploy',
			repository: {
				owner: 'rokucommunity',
				repository: 'roku-deploy'
			},
			dependencies: []
		},
		{
			name: '@rokucommunity/logger',
			repository: {
				owner: 'rokucommunity',
				repository: 'logger'
			},
			dependencies: []
		},
		{
			name: '@rokucommunity/bslib',
			repository: {
				owner: 'rokucommunity',
				repository: 'logger'
			},
			dependencies: []
		},
		{
			name: 'brighterscript',
			repository: {
				owner: 'rokucommunity',
				repository: 'brighterscript'
			},
			dependencies: [{ name: '@rokucommunity/bslib' }, { name: '@rokucommunity/logger' }, { name: 'roku-deploy' }]
		},
		{
			name: 'roku-debug',
			repository: {
				owner: 'rokucommunity',
				repository: 'roku-debug'
			},
			dependencies: [{ name: 'brighterscript' }, { name: '@rokucommunity/logger' }, { name: 'roku-deploy' }]
		},
		{
			name: 'brighterscript-formatter',
			repository: {
				owner: 'rokucommunity',
				repository: 'brighterscript-formatter'
			},
			dependencies: [{ name: 'brighterscript' }]
		},
		{
			name: '@rokucommunity/bslint',
			repository: {
				owner: 'rokucommunity',
				repository: 'bslint'
			},
			dependencies: [{ name: 'brighterscript' }]
		},
		{
			name: '@rokucommunity/brs',
			repository: {
				owner: 'rokucommunity',
				repository: 'brs'
			},
			dependencies: []
		},
		{
			name: 'ropm',
			repository: {
				owner: 'rokucommunity',
				repository: 'brs'
			},
			dependencies: [{ name: 'brighterscript' }, { name: 'roku-deploy' }]
		},
		{
			name: 'roku-report-analyzer',
			repository: {
				owner: 'rokucommunity',
				repository: 'roku-report-analyzer'
			},
			dependencies: [{ name: '@rokucommunity/logger' }, { name: 'brighterscript' }]
		},
		{
			name: 'vscode-brightscript-language',
			repository: {
				owner: 'rokucommunity',
				repository: 'vscode-brightscript-language'
			},
			dependencies: [
				{ name: 'roku-deploy' },
				{ name: 'roku-debug' },
				{ name: 'brighterscript' },
				{ name: 'brighterscript-formatter' },
				{ name: '@rokucommunity/logger' }
			]
		},
		{
			name: 'roku-promise',
			repository: {
				owner: 'rokucommunity',
				repository: 'roku-promise'
			},
			dependencies: [{ name: 'brighterscript' }]
		},
		{
			name: '@rokucommunity/promises',
			repository: {
				owner: 'rokucommunity',
				repository: 'promises'
			},
			dependencies: [{ name: 'brighterscript' }, { name: 'roku-deploy' }]
		},
		{
			name: 'rooibos-roku',
			repository: {
				owner: 'rokucommunity',
				repository: 'rooibos'
			},
			dependencies: [{ name: 'brighterscript' }, { name: 'roku-deploy' }]
		}
	];

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
	<h1>RokuCommunity Project Dependencies</h1>
	<p>This is a list of all the projects in the RokuCommunity and their dependencies.</p>
	<div class="cards-container">
		{#each projects as project}
			<div class="card">
				<h2>
					<a href={`https://github.com/${project.repository.owner}/${project.repository.repository}`} target="_blank">
						{project.name}
					</a>
				</h2>
				<div class="version-row">
					<span>
						Version: {project.currentVersion}
					</span>
					<div class="update-tag" class:is-green={!project.updateRequired} class:is-red={project.updateRequired}>
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
</main>

<style>
	a {
		text-decoration: none;
	}
	.cards-container {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.card {
		position: relative;
		border: 1px solid #ccc;
		border-radius: 8px;
		padding: 1rem;
		width: 300px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
		margin: 0; /* Remove all margins */
		padding: 0; /* Remove all padding */
	}

	.update-tag {
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.875rem;
		font-weight: bold;
		color: white;
	}

	.update-tag.is-green {
		background-color: #4db064; /* Green */
	}

	.update-tag.is-red {
		background-color: #dc3545; /* Red */
	}
</style>
