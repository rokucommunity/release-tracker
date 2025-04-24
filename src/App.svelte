<script lang="ts">
	interface Project {
		/**
		 * The name of the project
		 */
		name: string;
		/**
		 * The full URL of the project repository on github
		 */
		repositoryUrl: string;
		/**
		 * List of other RokuCommunity dependencies this project depends on. This is used to determine the order of releases
		 * and to determine if a project needs a new release.
		 */
		dependencies: string[];
	}
	const projects: Project[] = [
			{
				name: 'roku-deploy',
                repositoryUrl: 'https://github.com/rokucommunity/roku-deploy',
				dependencies: []
			},
			{
				name: '@rokucommunity/logger',
                repositoryUrl: 'https://github.com/rokucommunity/logger',
				dependencies: []
			},
			{
				name: '@rokucommunity/bslib',
                repositoryUrl: 'https://github.com/rokucommunity/logger',
				dependencies: []
			},
			{
				name: 'brighterscript',
                repositoryUrl: 'https://github.com/rokucommunity/brighterscript',
				dependencies: ['@rokucommunity/bslib', '@rokucommunity/logger', 'roku-deploy']
			},
			{
				name: 'roku-debug',
                repositoryUrl: 'https://github.com/rokucommunity/roku-debug',
				dependencies: ['brighterscript', '@rokucommunity/logger', 'roku-deploy']
			},
			{
				name: 'brighterscript-formatter',
                repositoryUrl: 'https://github.com/rokucommunity/brighterscript-formatter',
				dependencies: ['brighterscript']
			},
			{
				name: '@rokucommunity/bslint',
                repositoryUrl: 'https://github.com/rokucommunity/bslint',
				dependencies: ['brighterscript']
			},
			{
				name: '@rokucommunity/brs',
                repositoryUrl: 'https://github.com/rokucommunity/brs',
				dependencies: []
			},
			{
				name: 'ropm',
                repositoryUrl: 'https://github.com/rokucommunity/brs',
				dependencies: ['brighterscript', 'roku-deploy']
			},
			{
				name: 'roku-report-analyzer',
                repositoryUrl: 'https://github.com/rokucommunity/roku-report-analyzer',
				dependencies: ['@rokucommunity/logger', 'brighterscript']
			},
			{
				name: 'vscode-brightscript-language',
                repositoryUrl: 'https://github.com/rokucommunity/vscode-brightscript-language',
				dependencies: ['roku-deploy', 'roku-debug', 'brighterscript', 'brighterscript-formatter', '@rokucommunity/logger']
			},
			{
				name: 'roku-promise',
                repositoryUrl: 'https://github.com/rokucommunity/roku-promise',
				dependencies: ['brighterscript']
			},
			{
				name: '@rokucommunity/promises',
                repositoryUrl: 'https://github.com/rokucommunity/promises',
				dependencies: ['brighterscript', 'roku-deploy']
			},
			{
				name: 'rooibos-roku',
                repositoryUrl: 'https://github.com/rokucommunity/rooibos',
				dependencies: ['brighterscript', 'roku-deploy']
			}
		] as Array<Pick<Project, 'name'> & Partial<Project>>
	).map((project) => {
		const repoName = project.name.split('/').pop();
		return {
			...project,
			dependencies:
				project.dependencies?.map((d) => ({
					name: d,
					previousReleaseVersion: undefined as any,
					newVersion: undefined as any
				})) ?? [],
			devDependencies:
				project.devDependencies?.map((d) => ({
					name: d,
					previousReleaseVersion: undefined as any,
					newVersion: undefined as any
				})) ?? [],
			npmName: project.npmName ?? project.name,
			repositoryUrl:
				project.repositoryUrl ?? `https://github.com/rokucommunity/${repoName}`,
			changes: []
		};
	});
</script>

<main></main>

<style>
</style>
