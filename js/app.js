import React, {useEffect, useState} from "react"
import {Octokit} from "@octokit/rest"
import Commits from "./commits"
import {pipe, none} from "ramda"
import { formatISO, subDays } from 'date-fns'

const getAuthor = (commit) => commit.commit.author.name + "," + commit.commit.author.email + ","
    + commit.commit.author.date

const sameCommit = (c1, c2) =>
    c1.sha === c2.sha || getAuthor(c1) === getAuthor(c2)

const fillMissing = ([dev, prod]) =>
    [dev, [...dev.filter(c => none(cp => sameCommit(cp, c), prod)).map(c => ({...c, missing: true})), ...prod]]

const replaceCommit = (commits, sha, commit) => commits.map(c => c.sha === sha ? commit : c)
    
export default ({params = {}}) => {
    const {owner, repo, from, to, token} = params
    if (!token) {
        return <div>Unautorized!</div>
    }
    if (!owner || !repo || !from || !to) {
        return <div>owner, repo, from and to are mandatory params</div>
    }
    const octokit = new Octokit({
        auth: token
    })
    const [commits, setCommits] = useState(null)
    const branches = [from, to]
    useEffect(() => {
        Promise.all(branches.map(b => octokit.repos.listCommits({
            owner,
            repo,
            sha: b,
            per_page: 1000,
            since: formatISO(subDays(new Date(), 60))
        })))
        .then((responses) => responses.map(c => c.data))
        .then(pipe(fillMissing, setCommits))
        
    }, [owner, repo, from, to])
    
    const goToIssue = (issue) => `https://github.com/${owner}/${repo}/issues/${issue}`
    const getHead = (commits) => commits.filter(c => !c.missing)[0].sha
    const cherryPick = async (sha, commit) => {
        const {author, committer, message, tree} = commit
        const newCommit = await octokit.git.createCommit({
            owner,
            repo,
            message,
            tree: tree.sha,
            author,
            committer,
            parents: [getHead(commits[1])]
        })
        await octokit.git.updateRef({
            owner,
            repo,
            ref: `heads/${to}`,
            sha: newCommit.data.sha,
        })
        debugger
        setCommits([commits[0], replaceCommit(commits[1], sha, {...newCommit.data, commit})])
    }

    return commits && (<div className="bg-gray-700 p-6"><div className="text-xl text-white text-center">{owner}/{repo}</div><div className="flex">
        {branches.map((b, idx) => <div className="flex-1" key={b}><Commits commits={commits[idx]} branch={b}
            goToIssue={goToIssue} cherryPick={cherryPick}/></div>)}
    </div></div>) || <div>Loading...</div>
}