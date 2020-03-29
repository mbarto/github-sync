import React, {useEffect, useState} from "react"
import {Octokit} from "@octokit/rest"
import Commits from "./commits"
import Confirm from "./confirm"
import {pipe, none} from "ramda"
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

const setCommits = (context, event) => event.commits

const match = (state, cases) => {
    return Object.keys(cases).reduce((previous, current) => {
        return state.matches(current) ? cases[current] : previous
    }, () => null)()
}

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

    const loadCommits = () => Promise.all(["from", "to"].map(branch => octokit.repos.listCommits({
        owner,
        repo,
        sha: branches[branch],
        per_page: 1000,
        since: formatISO(subDays(new Date(), days || 60))
    }))).then((responses) => responses.map(c => c.data))

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
                    src: loadCommits,
                    onDone: {
                      target: 'sync',
                      actions: assign({
                        commits: (context, event) => fillMissing(event.data)
                      })
                    },
                    onError: {
                      target: 'loaderror',
                      actions: assign({ error: (context, event) => event.data })
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
                                target: 'askconfirm',
                                actions: assign({
                                    confirm: (context, event) => event.handlers
                                })
                            }
                        }
                    },
                    askconfirm: {
                        on: {
                            cancel: 'idle',
                            updating: {
                                target: 'picking'
                            }
                        }
                    },
                    picking: {
                        on: {
                            update: {
                                target: 'idle',
                                actions: assign({
                                    commits: setCommits
                                })
                            },
                            error: {
                                target: 'pickerror',
                                actions: assign({
                                    error: (context, event) => event.error
                                })
                            }
                        }
                    },
                    pickerror: {}
                }
                
            }
        }
    })

    const [state, send] = useMachine(syncMachine, {});
    const {commits, confirm, error} = state.context
    
    const goToIssue = (issue) => `https://github.com/${owner}/${repo}/issues/${issue}`
    const getHead = (commits) => commits.filter(c => !c.missing)[0].sha

    const withConfirm = (callback) => (...params) => {
        send('confirmPick', {
            handlers: {
                handler: () => {
                    callback(...params)
                    send('cancel')
                },
                cancel: () => {
                    send('cancel')
                }
            }
        })
    }
    const cherryPick = withConfirm(async (sha, commit) => {
        const {author, committer, message, tree} = commit
        try {
            send('updating')
            const newCommit = await octokit.git.createCommit({
                owner,
                repo,
                message,
                tree: tree.sha,
                author,
                committer,
                parents: [getHead(commits.to)]
            })
            await octokit.git.updateRef({
                owner,
                repo,
                ref: `heads/${to}`,
                sha: newCommit.data.sha,
            })
            send('update', {
                commits: {
                    from: commits.from, 
                    to: replaceCommit(commits.to, sha, {...newCommit.data, commit})
                }
            })
        } catch(error) {
            send('error', {error})
        }
    })
    return match(state, {
        loaderror: () => <div>Error loading repositories info: {error.message}</div>,
        loading: () => <div className="flex items-center justify-center h-screen w-screen fixed top-0 left-0"><Spinner/></div>,
        sync: () => (<div className="bg-gray-700 p-6">
            <div className="text-xl text-white text-center">{owner}/{repo}</div>
            <div className="flex">
                {["from", "to"].map(branch => <div className="flex-1" key={branch}><Commits commits={commits[branch]} branch={branches[branch]}
                    goToIssue={goToIssue} cherryPick={cherryPick}/></div>)}
            </div>
            {state.matches('sync.picking') && <div className="flex items-center justify-center h-screen w-screen fixed top-0 left-0"><Spinner color="orange"/></div>}
            {state.matches('sync.askconfirm') && <Confirm message={"Do you want to cherry-pick the selected commit?"}
                onConfirm={confirm.handler}
                onCancel={confirm.cancel}
            />}
            {error && <div>{error.message || error}</div>}
        </div>)
    })
}