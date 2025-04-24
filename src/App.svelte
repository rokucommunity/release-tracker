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
			dependencies: [
				{ name: '@rokucommunity/bslib' },
				{ name: '@rokucommunity/logger' },
				{ name: 'roku-deploy' }
			]
		},
		{
			name: 'roku-debug',
			repository: {
				owner: 'rokucommunity',
				repository: 'roku-debug'
			},
			dependencies: [
				{ name: 'brighterscript' },
				{ name: '@rokucommunity/logger' },
				{ name: 'roku-deploy' }
			]
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
			await hydrateProject(project);
		}
		projects = projects;
	}

	hydrateAllProjects();
</script>

<main>
	<h1>RokuCommunity Project Dependencies</h1>
	<p>This is a list of all the projects in the RokuCommunity and their dependencies.</p>
	<ul>
		{#each projects as project}
			<li>
				<a
					href={`https://github.com/${project.repository.owner}/${project.repository.repository}`}
					target="_blank">{project.name}.</a
				>
				{#if project.dependencies.length > 0}
					<ul>
						{#each project.dependencies as dependency}
							{@const dProject = projects.find((x) => x.name === dependency.name)}
							<li>
								<a
									target="_blank"
									href={`https://github.com/${dProject?.repository.owner}/${dProject?.repository.repository}`}
									>{dependency.name}</a>@{dependency.currentVersion} (v{dProject?.currentVersion} available)
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
</main>

<style>
</style>
