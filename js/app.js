import React from "react"
import {Octokit} from "@octokit/rest"
import Commits from "./commits"
import Confirm from "./confirm"
import {none} from "ramda"
import { formatISO, subDays } from 'date-fns'
import { createMachine, assign } from 'xstate';
import { useMachine } from "@xstate/react"
import Spinner from "react-spinkit"

const getAuthor = (commit) => commit.commit.author.name + "," + commit.commit.author.email + ","
    + commit.commit.author.date

const sameCommit = (c1, c2) =>
    c1.sha === c2.sha || getAuthor(c1) === getAuthor(c2)

const fillMissing = ([from, to]) => ({
    from,
    to: [
        ...from.filter(c => none(cp => sameCommit(cp, c), to)).map(c => ({...c, missing: true})),
        ...to
    ]
})

const replaceCommit = (commits, sha, commit) => commits.map(c => c.sha === sha ? commit : c)

const match = (state, cases) => {
    return Object.keys(cases).reduce((previous, current) => {
        return state.matches(current) ? cases[current] : previous
    }, () => null)()
}

const confirmMachine = createMachine({
    id: 'confirm',
    initial: 'ask',
    context: {
        payload: null
    },
    states: {
        ask: {
            on: {
                confirm: 'confirmed',
                cancel: 'canceled'
            }
        },
        confirmed: {
            type: "final",
            data: {
                confirmed: (context, event) => context.payload
            }
        },
        canceled: {
            type: "final",
            data: {
                confirmed: false
            }
        }
    }
})

const syncMachine = createMachine({
    id: 'sync',
    initial: 'loading',
    context: {
        commits: {from: [], to: []},
        confirm: null,
        error: null
    },
    states: {
        loading: {
            invoke: {
                id: 'loadCommits',
                src: 'loadCommits',
                onDone: {
                  target: 'sync',
                  actions: 'loadCommits'
                },
                onError: {
                  target: 'loaderror',
                  actions: 'setError'
                }
            }
        },
        loaderror: {},
        sync: {
            initial: 'idle',
            states: {
                idle: {
                    on: {
                        confirmPick: {
                            target: 'askconfirm'
                        }
                    }
                },
                askconfirm: {
                    invoke: {
                        id: "confirm",
                        src: "confirm",
                        data: {
                            payload: (context, event) => event.data
                        },
                        autoForward: true,
                        onDone: [{
                            target: 'picking',
                            cond: (context, event) => event.data.confirmed
                        }, {
                            target: 'idle',
                            cond: (context, event) => !event.data.confirmed
                        }]
                    }
                },
                picking: {
                    invoke: {
                        id: "pick",
                        src: "pick",
                        onDone: {
                            target: 'idle',
                            actions: 'updateCommits'
                        },
                        onError: {
                            target: 'pickerror',
                            actions: 'setError'
                        }
                    }
                },
                pickerror: {}
            }
        }
    }
})

export default ({params = {}}) => {
    const {owner, repo, from, to, token, days} = params
    if (!token) {
        return <div>Unautorized, please add token param!</div>
    }
    if (!owner || !repo || !from || !to) {
        return <div>owner, repo, from and to are mandatory params</div>
    }
    const octokit = new Octokit({
        auth: token
    })

    const branches = {from, to}

    const [state, send] = useMachine(syncMachine, {
        actions: {
            loadCommits: assign({
                commits: (context, event) => fillMissing(event.data)
            }),
            updateCommits: assign({
                commits: (context, event) => event.data.commits
            }),
            setError: assign({ error: (context, event) => event.error || event.data })
        },
        services: {
            loadCommits: Promise.all(["from", "to"].map(branch => octokit.repos.listCommits({
                owner,
                repo,
                sha: branches[branch],
                per_page: 1000,
                since: formatISO(subDays(new Date(), days || 60))
            }))).then((responses) => responses.map(c => c.data)),
            confirm: confirmMachine,
            pick: (context, event) => cherryPick(context.commits, event.data.confirmed)
        }
    });
    const {commits, error} = state.context
    
    const goToIssue = (issue) => `https://github.com/${owner}/${repo}/issues/${issue}`
    const getHead = (commits) => commits.filter(c => !c.missing)[0].sha

    const cherryPick = (commits, {sha, commit}) => {
        const {author, committer, message, tree} = commit
        return octokit.git.createCommit({
            owner,
            repo,
            message,
            tree: tree.sha,
            author,
            committer,
            parents: [getHead(commits.to)]
        }).then((newCommit) => 
            octokit.git.updateRef({
                owner,
                repo,
                ref: `heads/${to}`,
                sha: newCommit.data.sha,
            }).then(() => ({
                commits: {
                    from: commits.from, 
                    to: replaceCommit(commits.to, sha, {...newCommit.data, commit})
                }
            }))
        )
    };

    const askConfirm = (sha, commit) => {
        send('confirmPick', {
            data: {
                sha,
               commit
            }
        })
    }
    return match(state, {
        loaderror: () => <div>Error loading repositories info: {error.message}</div>,
        loading: () => <div className="flex items-center justify-center h-screen w-screen fixed top-0 left-0"><Spinner/></div>,
        sync: () => (<div className="bg-gray-700 p-6">
            <div className="text-xl text-white text-center">{owner}/{repo}</div>
            <div className="flex">
                {["from", "to"].map(branch => <div className="flex-1" key={branch}><Commits commits={commits[branch]} branch={branches[branch]}
                    goToIssue={goToIssue} cherryPick={askConfirm}/></div>)}
            </div>
            {state.matches('sync.picking') && <div className="flex items-center justify-center h-screen w-screen fixed top-0 left-0"><Spinner color="orange"/></div>}
            {state.matches('sync.askconfirm') && <Confirm message={"Do you want to cherry-pick the selected commit?"}
                onConfirm={() => send('confirm')}
                onCancel={() => send('cancel')}
            />}
            {error && <div>{error.message || error}</div>}
        </div>)
    })
}