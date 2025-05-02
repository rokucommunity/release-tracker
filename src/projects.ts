export interface Project {
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
   * What release line is this project associated with. Typically `master` or some synchronized alpha release like `bsc-v1`
   */
  releaseLine: string;

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
     * What release line is this dependency associated with. Typically `master` or some synchronized alpha release like `bsc-v1`
     */
    releaseLine: string;
    /**
     * The version of the dependency that this project last released with
     */
    currentVersion?: string;
  }>;

  /**
   * Is the project currently having its data fetched?
   */
  isLoading?: boolean;

  /**
   * Does this project have any unreleased commits?
   */
  hasUnreleasedCommits?: boolean;
}

export function getAllProjects(): Project[] {
  return [
    {
      name: 'roku-deploy',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-deploy'
      },
      releaseLine: 'master',
      dependencies: []
    },
    {
      name: '@rokucommunity/logger',
      repository: {
        owner: 'rokucommunity',
        repository: 'logger'
      },
      releaseLine: 'master',
      dependencies: []
    },
    {
      name: '@rokucommunity/bslib',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslib'
      },
      releaseLine: 'master',
      dependencies: []
    },
    {
      name: 'brighterscript',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript'
      },
      releaseLine: 'master',
      dependencies: [
        { name: '@rokucommunity/bslib', releaseLine: 'master' },
        { name: '@rokucommunity/logger', releaseLine: 'master' },
        { name: 'roku-deploy', releaseLine: 'master' }
      ]
    },
    {
      name: 'roku-debug',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-debug'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' },
        { name: '@rokucommunity/logger', releaseLine: 'master' },
        { name: 'roku-deploy', releaseLine: 'master' }]
    },
    {
      name: 'brighterscript-formatter',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript-formatter'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' }
      ]
    },
    {
      name: '@rokucommunity/bslint',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslint'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' }
      ]
    },
    {
      name: '@rokucommunity/brs',
      repository: {
        owner: 'rokucommunity',
        repository: 'brs'
      },
      releaseLine: 'master',
      dependencies: []
    },
    {
      name: 'ropm',
      repository: {
        owner: 'rokucommunity',
        repository: 'brs'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' },
        { name: 'roku-deploy', releaseLine: 'master' }
      ]
    },
    {
      name: 'roku-report-analyzer',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-report-analyzer'
      },
      releaseLine: 'master',
      dependencies: [
        { name: '@rokucommunity/logger', releaseLine: 'master' },
        { name: 'brighterscript', releaseLine: 'master' }
      ]
    },
    {
      name: 'vscode-brightscript-language',
      repository: {
        owner: 'rokucommunity',
        repository: 'vscode-brightscript-language'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'roku-deploy', releaseLine: 'master' },
        { name: 'roku-debug', releaseLine: 'master' },
        { name: 'brighterscript', releaseLine: 'master' },
        { name: 'brighterscript-formatter', releaseLine: 'master' },
        { name: '@rokucommunity/logger', releaseLine: 'master' }
      ]
    },
    {
      name: 'roku-promise',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-promise'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' }
      ]
    },
    {
      name: '@rokucommunity/promises',
      repository: {
        owner: 'rokucommunity',
        repository: 'promises'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' },
        { name: 'roku-deploy', releaseLine: 'master' }
      ]
    },
    {
      name: 'rooibos-roku',
      repository: {
        owner: 'rokucommunity',
        repository: 'rooibos'
      },
      releaseLine: 'master',
      dependencies: [
        { name: 'brighterscript', releaseLine: 'master' },
        { name: 'roku-deploy', releaseLine: 'master' }
      ]
    }
  ];
}
