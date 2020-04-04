import React from "react"
import { format, parseISO } from 'date-fns'
import {match, uniq} from "ramda"

export default ({commits, branch, goToIssue = () => {}, cherryPick = () => {}}) => {
    const getIssues = (message) => uniq(match(/#([0-9]+)/g, message)
        .map(i => i.substring(1))).map(i => <a key={i} className="link" href={goToIssue(i)} target="_blank">#{i}</a>)
    const renderCommit = (c) => (
        <li key={c.sha} className="card">
            <div className="link"><a href={c.html_url} target="_blank">{c.sha}</a></div>
            <div>{format(parseISO(c.commit.author.date), 'dd/MM/yyyy')}</div>
            <div>{getIssues(c.commit.message)}</div>
            <div>{c.commit.message}</div>
        </li>)
    const renderMissing = (c) => (
        <li key={c.sha} onClick={() => cherryPick(c.sha, c.commit)}
            className="card missing group">
            <div className="action group-hover:hidden" >Missing</div>
            <div className="action group-hover:block hidden" >Pick</div>
        </li>
    )
    
    return <div className="commits">
        <p className="title">Branch: {branch}</p>
        <ul>
            {commits.map(c => c.missing && renderMissing(c) || renderCommit(c))}
        </ul>
    </div>
}
