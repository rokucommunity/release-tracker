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
    versionFromTipOfReleaseLine?: string;
    /**
     * The version of the dependency that this project last released with
     */
    versionFromLatestRelease?: string;
  }>;

  /**
   * Is the project currently having its data fetched?
   */
  isLoading?: boolean;

  /**
   * Did hydration fail (e.g. we couldn't find/fetch a `package-lock.json`)? When set, the card shows a
   * failed state instead of spinning on the loading indicator forever.
   */
  loadFailed?: boolean;

  /**
   * Set when we detect that a release is already in progress for this project (i.e. there's an open
   * `release/<version>` branch / PR whose name is the target version). Lets the card show an
   * "in progress" badge instead of nudging the user to start a release that's already underway.
   */
  releaseInProgress?: {
    /** The release version (e.g. `3.0.0-alpha.0`) parsed from the release branch/PR name */
    version: string;
    /** Link to the release PR (when known via the API) or the release branch (when found by raw probe) */
    url: string;
    /** The release PR number, when we resolved it via the GitHub API */
    prNumber?: number;
  };

  /**
   * Relative paths (from the repo root) where the `package-lock.json` file might live, tried in order.
   * The first location that yields a valid file wins. Defaults to `['package-lock.json']` when not specified.
   * Only projects whose lock file is not at the repo root (or whose location varies between branches/tags)
   * need to specify this.
   */
  packageLockLocations?: string[];

  /**
   * What kind of artifact this project publishes. Drives which external store link is shown on the card.
   */
  projectType: 'npm' | 'vscode-extension';

  /**
   * If `projectType` is `vscode-extension`, this is the `publisher.extension` id on the VS Code marketplace.
   */
  vscodeExtensionId?: string;

  /**
   * Should all commits be shown in the UI for this project? Or just up to the first `MAX_COLLAPSED_COMMITS`
   */
  showAllCommits?: boolean;

  /**
   * Does this project have any unreleased commits?
   */
  unreleasedCommits?: RestEndpointMethodTypes["repos"]["compareCommits"]["response"]['data']['commits'];

  /**
   * Temporarily ignored for this session (treated as up-to-date for tier readiness)
   */
  ignored?: boolean;

  /**
   * Conclusion of the latest `security-audit.yml` workflow run on this card's release-line branch.
   * Parsed out of the shields.io badge response (no GitHub API calls).
   * `unknown` covers "no status", missing workflow, missing repo, and parse failures.
   */
  ciStatus?: 'success' | 'failure' | 'pending' | 'unknown';
}

export function getAllProjects(): Project[] {
  return [
    {
      name: 'roku-deploy',
      projectType: 'npm',
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
      projectType: 'npm',
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
      projectType: 'npm',
      hide: true,
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
      projectType: 'npm',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        // {
        //   name: '@rokucommunity/bslib',
        //   releaseLine: 'mainline'
        // },
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
      projectType: 'npm',
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
          name: '@rokucommunity/logger',
          releaseLine: 'mainline'
        },
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
      name: 'roku-test-automation',
      projectType: 'npm',
      repository: {
        owner: 'rokucommunity',
        repository: 'roku-test-automation'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      //v2 keeps its lock file under ./client, v3 (master) moved it to the repo root. Try root first, then ./client.
      packageLockLocations: ['package-lock.json', 'client/package-lock.json'],
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
      name: 'brighterscript-formatter',
      projectType: 'npm',
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
      projectType: 'npm',
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
      projectType: 'npm',
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
      projectType: 'npm',
      repository: {
        owner: 'rokucommunity',
        repository: 'ropm'
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
      projectType: 'npm',
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
      projectType: 'vscode-extension',
      vscodeExtensionId: 'RokuCommunity.brightscript',
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
      projectType: 'npm',
      hide: true,
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
      projectType: 'npm',
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
      projectType: 'npm',
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
      projectType: 'npm',
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
      name: '@rokucommunity/sgRouter',
      projectType: 'npm',
      repository: {
        owner: 'rokucommunity',
        repository: 'sgRouter'
      },
      releaseLine: {
        name: 'mainline',
        branch: 'master',
      },
      dependencies: [
        {
          name: '@rokucommunity/promises',
          releaseLine: 'mainline'
        },
        {
          name: 'brighterscript',
          releaseLine: 'mainline'
        }
      ]
    },
    {
      name: 'bsc-plugin-inline-annotation',
      projectType: 'npm',
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
      projectType: 'npm',
      repository: {
        owner: 'rokucommunity',
        repository: 'brighterscript'
      },
      releaseLine: {
        name: 'bsc-v1',
        branch: 'v1'
      },
      dependencies: [
        // {
        //   name: '@rokucommunity/bslib',
        //   releaseLine: 'mainline'
        // },
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
      projectType: 'npm',
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
      projectType: 'npm',
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
      projectType: 'npm',
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
      projectType: 'npm',
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
