import React from "react"
import { format, parseISO } from 'date-fns'
import {match, uniq} from "ramda"

export default ({commits, branch, goToIssue = () => {}, cherryPick = () => {}}) => {
    const getIssues = (message) => uniq(match(/#([0-9]+)/g, message)
        .map(i => i.substring(1))).map(i => <a key={i} className="font-bold underline" href={goToIssue(i)} target="_blank">#{i}</a>)
    const renderCommit = (c) => (
        <li key={c.sha} className="m-3 p-6 bg-white rounded-lg shadow-xl h-64 overflow-hidden">
            <div className="font-bold underline"><a href={c.html_url} target="_blank">{c.sha}</a></div>
            <div>{format(parseISO(c.commit.author.date), 'dd/MM/yyyy')}</div>
            <div>{getIssues(c.commit.message)}</div>
            <div>{c.commit.message}</div>
        </li>)
    const renderMissing = (c) => (
        <li key={c.sha} onClick={() => cherryPick(c.sha, c.commit)}
            className="transition duration-500 group ease-in-out transform hover:-translate-y-1 hover:scale-105 flex items-center justify-center m-3 p-6 bg-white rounded-lg shadow-xl h-64 overflow-hidden border-orange-600 border-2 border-dashed cursor-pointer">
            <div className="font-bold text-6xl group-hover:hidden" >Missing</div>
            <div className="font-bold text-6xl group-hover:block hidden" >Pick</div>
        </li>
    )
    
    return <div>
        <p className="p-3 text-base text-gray-300 text-center">Branch: {branch}</p>
        <ul>
            {commits.map(c => c.missing && renderMissing(c) || renderCommit(c))}
        </ul>
    </div>
}
