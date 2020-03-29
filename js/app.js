import React, {useEffect, useState} from "react"
import {Octokit} from "@octokit/rest"
import Commits from "./commits"
import Confirm from "./confirm"
import {pipe, none} from "ramda"
import { formatISO, subDays } from 'date-fns'

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
    
export default ({params = {}}) => {
    const {owner, repo, from, to, token, days} = params
    if (!token) {
        return <div>Unautorized, please add token param!</div>
    }
    if (!owner || !repo || !from || !to) {
        return <div>owner, repo, from and to are mandatory params</div>
    }
    const [error, setError] = useState(null)
    const octokit = new Octokit({
        auth: token
    })
    const [commits, setCommits] = useState(null)
    const branches = {from, to}
    useEffect(() => {
        Promise.all(["from", "to"].map(branch => octokit.repos.listCommits({
            owner,
            repo,
            sha: branches[branch],
            per_page: 1000,
            since: formatISO(subDays(new Date(), days || 60))
        })))
        .then((responses) => responses.map(c => c.data))
        .then(pipe(fillMissing, setCommits))
        .catch(e => setError(e))
        
    }, [owner, repo, from, to])
    
    const goToIssue = (issue) => `https://github.com/${owner}/${repo}/issues/${issue}`
    const getHead = (commits) => commits.filter(c => !c.missing)[0].sha

    const [confirm, setConfirm] = useState(null)

    const withConfirm = (callback) => (...params) => {
        setConfirm({
            handler: () => {
                callback(...params)
                setConfirm(null)
            },
            cancel: () => {
                setConfirm(null)
            }
        })
    }
    const cherryPick = withConfirm(async (sha, commit) => {
        const {author, committer, message, tree} = commit
        try {
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
            setCommits({
                from: commits.from, 
                to: replaceCommit(commits.to, sha, {...newCommit.data, commit})
            })
        } catch(e) {
            setError(e)
        }
    })

    return commits && (
        <div className="bg-gray-700 p-6">
                <div className="text-xl text-white text-center">{owner}/{repo}</div>
                <div className="flex">
                    {["from", "to"].map(branch => <div className="flex-1" key={branch}><Commits commits={commits[branch]} branch={branch}
                        goToIssue={goToIssue} cherryPick={cherryPick}/></div>)}
                </div>
                {confirm && 
                    <Confirm message={"Do you want to cherry-pick the selected commit?"}
                        onConfirm={confirm.handler}
                        onCancel={confirm.cancel}
                    />}
                {error && <div>{error.message || error}</div>}
        </div>
    ) || <div>Loading...</div>
}