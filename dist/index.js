/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 217:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const core = __nccwpck_require__(969)
const toolkit = __nccwpck_require__(289)

const packageInfo = __nccwpck_require__(147)
const { githubClient } = __nccwpck_require__(799)
const { logInfo, logWarning, logError } = __nccwpck_require__(750)
const { getInputs, parseCommaOrSemicolonSeparatedValue } = __nccwpck_require__(25)
const { verifyCommits } = __nccwpck_require__(418)
const { dependabotAuthor } = __nccwpck_require__(650)
const { updateTypes } = __nccwpck_require__(373)
const { updateTypesPriority } = __nccwpck_require__(373)

module.exports = async function run({
  github,
  context,
  inputs,
  dependabotMetadata,
}) {
  console.log('BEFORE getInputs()')
  if (typeof inputs['skip-commit-verification'] === 'boolean') {
    console.log('skip-commit-verification is a BOOLEAN!')
  } else if (typeof inputs['skip-commit-verification'] === 'string') {
    console.log('skip-commit-verification is a STRING!')
  } else {
    console.log('skip-commit-verification is SOMETHING ELSE!')
  }
  const { updateType } = dependabotMetadata
  const dependencyNames = parseCommaOrSemicolonSeparatedValue(
    dependabotMetadata.dependencyNames
  )

  const {
    MERGE_METHOD,
    EXCLUDE_PKGS,
    MERGE_COMMENT,
    APPROVE_ONLY,
    USE_GITHUB_AUTO_MERGE,
    TARGET,
    PR_NUMBER,
    SKIP_COMMIT_VERIFICATION,
  } = getInputs(inputs)

  console.log('AFTER getInputs()')
  if (typeof SKIP_COMMIT_VERIFICATION === 'boolean') {
    console.log('skip-commit-verification is a BOOLEAN!')
  } else if (typeof SKIP_COMMIT_VERIFICATION === 'string') {
    console.log('skip-commit-verification is a STRING!')
  } else {
    console.log('skip-commit-verification is SOMETHING ELSE!')
  }

  try {
    toolkit.logActionRefWarning()

    const { pull_request } = context.payload

    if (!pull_request && !PR_NUMBER) {
      return logError(
        'This action must be used in the context of a Pull Request or with a Pull Request number'
      )
    }

    const client = githubClient(github, context)
    const pr = pull_request || (await client.getPullRequest(PR_NUMBER))

    const isDependabotPR = pr.user.login === dependabotAuthor
    if (!isDependabotPR) {
      return logWarning('Not a dependabot PR, skipping.')
    }

    const commits = await client.getPullRequestCommits(pr.number)
    if (!commits.every(commit => commit.author?.login === dependabotAuthor)) {
      return logWarning('PR contains non dependabot commits, skipping.')
    }

    if (!SKIP_COMMIT_VERIFICATION) {
      try {
        await verifyCommits(commits)
      } catch {
        return logWarning(
          'PR contains invalid dependabot commit signatures, skipping.'
        )
      }
    }

    if (
      TARGET !== updateTypes.any &&
      updateTypesPriority.indexOf(updateType) >
        updateTypesPriority.indexOf(TARGET)
    ) {
      core.setFailed(
        `Semver bump is higher than allowed in TARGET.
Tried to do a '${updateType}' update but the max allowed is '${TARGET}'`
      )
      return
    }

    const changedExcludedPackages = EXCLUDE_PKGS.filter(
      pkg => dependencyNames.indexOf(pkg) > -1
    )

    // TODO: Improve error message for excluded packages?
    if (changedExcludedPackages.length > 0) {
      return logInfo(`${changedExcludedPackages.length} package(s) excluded: \
${changedExcludedPackages.join(', ')}. Skipping.`)
    }

    if (
      dependencyNames.indexOf(packageInfo.name) > -1 &&
      updateType === updateTypes.major
    ) {
      const upgradeMessage = `Cannot automerge ${packageInfo.name} major release.
    Read how to upgrade it manually:
    https://github.com/fastify/${packageInfo.name}#how-to-upgrade-from-2x-to-new-3x`

      core.setFailed(upgradeMessage)
      return
    }

    await client.approvePullRequest(pr.number, MERGE_COMMENT)
    if (APPROVE_ONLY) {
      return logInfo(
        'APPROVE_ONLY set, PR was approved but it will not be merged'
      )
    }

    if (USE_GITHUB_AUTO_MERGE) {
      await client.enableAutoMergePullRequest(pr.node_id, MERGE_METHOD)
      return logInfo('USE_GITHUB_AUTO_MERGE set, PR was marked as auto-merge')
    }

    await client.mergePullRequest(pr.number, MERGE_METHOD)
    logInfo('Dependabot merge completed')
  } catch (error) {
    core.setFailed(error.message)
  }
}


/***/ }),

/***/ 650:
/***/ ((module) => {

"use strict";

const dependabotAuthor = 'dependabot[bot]'

const dependabotCommitter = 'GitHub'

module.exports = {
  dependabotAuthor,
  dependabotCommitter,
}


/***/ }),

/***/ 799:
/***/ ((module) => {

"use strict";


function githubClient(github, context) {
  const payload = context.payload

  const repo = payload.repository
  const owner = repo.owner.login
  const repoName = repo.name

  return {
    async getPullRequest(pullRequestNumber) {
      const { data: pullRequest } = await github.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: pullRequestNumber,
      })
      return pullRequest
    },

    async approvePullRequest(pullRequestNumber, approveComment) {
      const { data } = await github.rest.pulls.createReview({
        owner,
        repo: repoName,
        pull_number: pullRequestNumber,
        event: 'APPROVE',
        body: approveComment,
      })
      // todo assert
      return data
    },

    async mergePullRequest(pullRequestNumber, mergeMethod) {
      const { data } = await github.rest.pulls.merge({
        owner,
        repo: repoName,
        pull_number: pullRequestNumber,
        merge_method: mergeMethod,
      })
      // todo assert
      return data
    },

    async enableAutoMergePullRequest(pullRequestId, mergeMethod) {
      const query = `
mutation ($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
  enablePullRequestAutoMerge(
    input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }
  ) {
    pullRequest {
      autoMergeRequest {
        enabledAt
        enabledBy {
          login
        }
      }
    }
  }
}
`
      const { data } = await github.graphql(query, {
        pullRequestId,
        mergeMethod: mergeMethod.toUpperCase(),
      })
      return data
    },

    async getPullRequestDiff(pullRequestNumber) {
      const { data: pullRequest } = await github.rest.pulls.get({
        owner,
        repo: repoName,
        pull_number: pullRequestNumber,
        mediaType: {
          format: 'diff',
        },
      })
      return pullRequest
    },

    async getPullRequestCommits(pullRequestNumber) {
      const { data } = await github.rest.pulls.listCommits({
        owner,
        repo: repoName,
        pull_number: pullRequestNumber,
      })

      return data
    },
  }
}

module.exports = { githubClient }


/***/ }),

/***/ 600:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const run = __nccwpck_require__(217)

module.exports = run


/***/ }),

/***/ 750:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


const { debug, error, info, warning } = __nccwpck_require__(969)

const stringify = msg =>
  typeof msg === 'string' ? msg : msg.stack || msg.toString()

const log = logger => message => logger(stringify(message))

exports.logDebug = log(debug)
exports.logError = log(error)
exports.logInfo = log(info)
exports.logWarning = log(warning)


/***/ }),

/***/ 373:
/***/ ((module) => {

"use strict";


// NOTE: fetch-metadata only support the major, minor and patch update types for now, so I removed the `pre` types
const updateTypes = {
  major: 'version-update:semver-major',
  minor: 'version-update:semver-minor',
  patch: 'version-update:semver-patch',
  any: 'version-update:semver-any',
}

const updateTypesPriority = [
  updateTypes.patch,
  updateTypes.minor,
  updateTypes.major,
  updateTypes.any,
]

const mapUpdateType = input => {
  return updateTypes[input] || updateTypes.any
}

module.exports = {
  mapUpdateType,
  updateTypes,
  updateTypesPriority,
}


/***/ }),

/***/ 25:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


const { mapUpdateType } = __nccwpck_require__(373)
const { logWarning } = __nccwpck_require__(750)

const mergeMethods = {
  merge: 'merge',
  squash: 'squash',
  rebase: 'rebase',
}

const getMergeMethod = inputs => {
  const input = inputs['merge-method']

  if (!input) {
    return mergeMethods.squash
  }

  if (!mergeMethods[input]) {
    logWarning(
      'merge-method input is ignored because it is malformed, defaulting to `squash`.'
    )
    return mergeMethods.squash
  }

  return mergeMethods[input]
}

const parseCommaOrSemicolonSeparatedValue = value => {
  return value ? value.split(/[;,]/).map(el => el.trim()) : []
}

exports.parseCommaOrSemicolonSeparatedValue =
  parseCommaOrSemicolonSeparatedValue

exports.getInputs = inputs => {
  if (!inputs) {
    throw new Error('Invalid inputs object passed to getInputs')
  }

  return {
    MERGE_METHOD: getMergeMethod(inputs),
    EXCLUDE_PKGS: parseCommaOrSemicolonSeparatedValue(inputs['exclude']),
    MERGE_COMMENT: inputs['merge-comment'] || '',
    APPROVE_ONLY: /true/i.test(inputs['approve-only']),
    USE_GITHUB_AUTO_MERGE: /true/i.test(inputs['use-github-auto-merge']),
    TARGET: mapUpdateType(inputs['target']),
    PR_NUMBER: inputs['pr-number'],
    SKIP_COMMIT_VERIFICATION: inputs['skip-commit-verification'],
  }
}


/***/ }),

/***/ 418:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const {
  dependabotAuthor,
  dependabotCommitter,
} = __nccwpck_require__(650)

function verifyCommits(commits) {
  commits.forEach(function (commit) {
    const {
      commit: {
        verification: { verified },
        committer,
        author,
      },
      sha,
    } = commit
    verifyCommitSignatureCommitterAndAuthor(sha, author, committer, verified)
  })
}

function verifyCommitSignatureCommitterAndAuthor(
  sha,
  author,
  committer,
  verified
) {
  if (
    !verified ||
    committer.name !== dependabotCommitter ||
    author.name !== dependabotAuthor
  ) {
    throw new Error(
      `Signature for commit ${sha} could not be verified - Not a dependabot commit`
    )
  }
}

module.exports = {
  verifyCommits,
  verifyCommitSignatureCommitterAndAuthor,
}


/***/ }),

/***/ 969:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 289:
/***/ ((module) => {

module.exports = eval("require")("actions-toolkit");


/***/ }),

/***/ 147:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse('{"name":"github-action-merge-dependabot","version":"3.6.0","description":"A GitHub action to automatically merge and approve Dependabot pull requests","main":"src/index.js","scripts":{"build":"ncc build src/index.js","lint":"eslint .","test":"tap test/**.test.js","prepare":"husky install"},"author":{"name":"Salman Mitha","email":"SalmanMitha@gmail.com"},"contributors":["Simone Busoli <simone.busoli@nearform.com>"],"license":"MIT","repository":{"type":"git","url":"git+https://github.com/fastify/github-action-merge-dependabot.git"},"bugs":{"url":"https://github.com/fastify/github-action-merge-dependabot/issues"},"homepage":"https://github.com/fastify/github-action-merge-dependabot#readme","dependencies":{"@actions/core":"^1.9.1","@actions/github":"^5.1.1","actions-toolkit":"github:nearform/actions-toolkit","gitdiff-parser":"^0.2.2","semver":"^7.3.8"},"devDependencies":{"@vercel/ncc":"^0.36.1","eslint":"^8.33.0","eslint-config-prettier":"^8.6.0","eslint-plugin-prettier":"^4.2.1","husky":"^8.0.3","prettier":"^2.8.3","proxyquire":"^2.1.3","sinon":"^15.0.1","tap":"^16.3.4"}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(600);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;