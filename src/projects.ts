import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest';

export interface Project {
  /**
   * The name of the project
   */
  name: string;

  /**
   * Should the project be hidden from the UI?
   */
  hide?: boolean;

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
  releaseLine: {
    name: string;
    branch: string;
  };

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
  unreleasedCommits?: RestEndpointMethodTypes["repos"]["compareCommits"]["response"]['data']['commits'];
}

export function getAllProjects(): Project[] {
  return [
    {
      name: 'roku-deploy',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-deploy'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: []
    },
    {
      name: '@rokucommunity/logger',
      repository: {
        owner: 'rokucommunity',
        repository: 'logger'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: []
    },
    {
      name: '@rokucommunity/bslib',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslib'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: []
    },
    {
      name: 'brighterscript',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: '@rokucommunity/bslib',
          releaseLine: 'mainline'
        },
        {
          name: '@rokucommunity/logger',
          releaseLine: 'mainline'
        },
        {
          name: 'roku-deploy',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'roku-debug',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-debug'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'brighterscript-formatter',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript-formatter'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: '@rokucommunity/bslint',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslint'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: '@rokucommunity/brs',
      repository: {
        owner: 'rokucommunity',
        repository: 'brs'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: []
    },
    {
      name: 'ropm',
      repository: {
        owner: 'rokucommunity',
        repository: 'brs'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        },
        {
          name: 'roku-deploy',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'roku-report-analyzer',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-report-analyzer'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: '@rokucommunity/logger',
          releaseLine: 'mainline'
        },
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'vscode-brightscript-language',
      repository: {
        owner: 'rokucommunity',
        repository: 'vscode-brightscript-language'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'roku-deploy',
          releaseLine: 'mainline'
        },
        {
          name: 'roku-debug',
          releaseLine: 'mainline'
        },
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        },
        {
          name: 'brighterscript-formatter',
          releaseLine: 'mainline'
        },
        {
          name: '@rokucommunity/logger',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'roku-promise',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-promise'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: '@rokucommunity/promises',
      repository: {
        owner: 'rokucommunity',
        repository: 'promises'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        },
        {
          name: 'roku-deploy',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'rooibos-roku',
      repository: {
        owner: 'rokucommunity',
        repository: 'rooibos'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        },
        {
          name: 'roku-deploy',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'bsc-plugin-auto-findnode',
      repository: {
        owner: 'rokucommunity',
        repository: 'bsc-plugin-auto-findnode'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'bsc-plugin-inline-annotation',
      hide: true,
      repository: {
        owner: 'rokucommunity',
        repository: 'bsc-plugin-inline-annotation'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'brighterscript',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript'
      },
      releaseLine: {
        name: 'bsc-v1',
        branch: 'v1'
      },
      dependencies: [
        {
          name: '@rokucommunity/bslib',
          releaseLine: 'mainline'
        },
        {
          name: '@rokucommunity/logger',
          releaseLine: 'mainline'
        },
        {
          name: 'roku-deploy',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: '@rokucommunity/bslint',
      repository: {
        owner: 'rokucommunity',
        repository: 'bslint'
      },
      releaseLine: {
        name: 'bsc-v1',
        branch: 'v1',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'bsc-v1'
        }
      ]
    },
    {
      name: 'bsc-plugin-auto-findnode',
      repository: {
        owner: 'rokucommunity',
        repository: 'bsc-plugin-auto-findnode'
      },
      releaseLine: {
        name: 'bsc-v1',
        branch: 'v1',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'bsc-v1'
        }
      ]
    },
    {
      name: 'rooibos-roku',
      repository: {
        owner: 'rokucommunity',
        repository: 'rooibos'
      },
      releaseLine: {
        name: 'bsc-v1',
        branch: 'v6'
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: 'bsc-v1'
        },
        {
          name: 'roku-deploy',
          releaseLine: 'roku-deploy-v4'
        },
        {
          name: 'roku-debug',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'roku-deploy',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-deploy'
      },
      releaseLine: {
        name: 'roku-deploy-v4',
        branch: 'v4'
      },
      dependencies: [
        {
          name: '@rokucommunity/logger',
          releaseLine: 'mainline'
        }
      ]
    }
  ];
}
