import React from "react"
import {Octokit} from "@octokit/rest"
import Commits from "./commits"
import {confirmMachine} from "./confirm"
import {none} from "ramda"
import { formatISO, subDays } from 'date-fns'
import { createMachine, assign } from 'xstate';
import Spinner from "react-spinkit"
import {createMachineUI} from "./machine-ui"
import {curry} from "ramda"

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

const goToIssue = curry((owner, repo, issue) => `https://github.com/${owner}/${repo}/issues/${issue}`)

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
            meta: {
                component: () => <div className="modal"><Spinner/></div>
            },
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
            meta: {
                component: ({send, owner = "", repo = "", branches = {}, commits = {}, children}) => (<div className="app">
                    <div className="title">{owner}/{repo}</div>
                    <div className="main">
                        {["from", "to"].map(branch => <div className="column" key={branch}><Commits commits={commits[branch]} branch={branches[branch]}
                            goToIssue={goToIssue(owner, repo)} cherryPick={(sha, commit) => {
                                send('confirmPick', {
                                    data: {
                                        sha,
                                       commit
                                    }
                                })
                            }}/></div>)}
                        {children}
                    </div>
                </div>)
            },
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
                        onDone: [{
                            target: 'picking',
                            cond: (context, event) => event.data && event.data.confirmed
                        }, {
                            target: 'idle',
                            cond: (context, event) => !event.data || !event.data.confirmed
                        }]
                    }
                },
                picking: {
                    meta: {
                        component: () => <div className="modal"><Spinner color="orange"/></div>
                    },
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

const getHead = (commits) => commits.filter(c => !c.missing)[0].sha

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
    const App = createMachineUI(syncMachine, {
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
            loadCommits: () => Promise.all(["from", "to"].map(branch => octokit.repos.listCommits({
                owner,
                repo,
                sha: branches[branch],
                per_page: 1000,
                since: formatISO(subDays(new Date(), days || 60))
            }))).then((responses) => responses.map(c => c.data)),
            confirm: confirmMachine,
            pick: ({commits}, {data}) => {
                const {sha, commit} = data.confirmed
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
            }
        }
    })
    return <App owner={owner} repo={repo} branches={branches}/>
}
