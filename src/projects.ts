import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest';

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
    releaseLine: {
      name: string;
      branch: string;
    };
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
  unreleasedCommits?: Array<RestEndpointMethodTypes["repos"]["compareCommits"]["response"]>
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
        name: 'master',
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
        name: 'master',
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
        name: 'master',
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: '@rokucommunity/bslib',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: '@rokucommunity/logger',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          }
        }]
    },
    {
      name: 'brighterscript-formatter',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript-formatter'
      },
      releaseLine: {
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: '@rokucommunity/logger',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'roku-debug',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'brighterscript-formatter',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: '@rokucommunity/logger',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
        name: 'master',
        branch: 'master',
      },
      dependencies: [
        {
          name: 'brighterscript',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: '@rokucommunity/logger',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
        },
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          },
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
          releaseLine: {
            name: 'bsc-v1',
            branch: 'v1'
          }
        },
        {
          name: 'roku-deploy',
          releaseLine: {
            name: 'master',
            branch: 'master',
          }
        }
      ]
    }
  ];
}
