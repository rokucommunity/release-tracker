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
   * The main branch this project is being developed on
   */
  branch: string;

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
      branch: 'master',
      dependencies: []
    },
    {
      name: '@rokucommunity/logger',
      repository: {
        owner: 'rokucommunity',
        repository: 'logger'
      },
      branch: 'master',
      dependencies: []
    },
    {
      name: '@rokucommunity/bslib',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslib'
      },
      branch: 'master',
      dependencies: []
    },
    {
      name: 'brighterscript',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript'
      },
      branch: 'master',
      dependencies: [{ name: '@rokucommunity/bslib' }, { name: '@rokucommunity/logger' }, { name: 'roku-deploy' }]
    },
    {
      name: 'roku-debug',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-debug'
      },
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }, { name: '@rokucommunity/logger' }, { name: 'roku-deploy' }]
    },
    {
      name: 'brighterscript-formatter',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript-formatter'
      },
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }]
    },
    {
      name: '@rokucommunity/bslint',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslint'
      },
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }]
    },
    {
      name: '@rokucommunity/brs',
      repository: {
        owner: 'rokucommunity',
        repository: 'brs'
      },
      branch: 'master',
      dependencies: []
    },
    {
      name: 'ropm',
      repository: {
        owner: 'rokucommunity',
        repository: 'brs'
      },
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }, { name: 'roku-deploy' }]
    },
    {
      name: 'roku-report-analyzer',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-report-analyzer'
      },
      branch: 'master',
      dependencies: [{ name: '@rokucommunity/logger' }, { name: 'brighterscript' }]
    },
    {
      name: 'vscode-brightscript-language',
      repository: {
        owner: 'rokucommunity',
        repository: 'vscode-brightscript-language'
      },
      branch: 'master',
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
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }]
    },
    {
      name: '@rokucommunity/promises',
      repository: {
        owner: 'rokucommunity',
        repository: 'promises'
      },
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }, { name: 'roku-deploy' }]
    },
    {
      name: 'rooibos-roku',
      repository: {
        owner: 'rokucommunity',
        repository: 'rooibos'
      },
      branch: 'master',
      dependencies: [{ name: 'brighterscript' }, { name: 'roku-deploy' }]
    }
  ];
}
