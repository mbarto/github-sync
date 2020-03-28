import React from "react"
import { format, parseISO } from 'date-fns'
import {match, uniq} from "ramda"

const cardClass = ({missing = false}) => {
    return "m-3 p-6 bg-white rounded-lg shadow-xl h-64 overflow-hidden" + (missing ? " border-orange-600 border-2 border-dashed" : "")
}

export default ({commits, branch, goToIssue = () => {}, cherryPick = () => {}}) => {
    const getIssues = (message) => uniq(match(/#([0-9]+)/g, message)
        .map(i => i.substring(1))).map(i => <a key={i} className="font-bold underline" href={goToIssue(i)} target="_blank">#{i}</a>)

    return <div>
        <p className="p-3 text-base text-gray-300 text-center">Branch: {branch}</p>
        <ul>
            {commits.map(c => <li key={c.sha} className={cardClass(c)}>
                <div className="font-bold underline"><a href={c.html_url} target="_blank">{c.sha}</a></div>
                <div>{format(parseISO(c.commit.author.date), 'dd/MM/yyyy')}</div>
                <div>{getIssues(c.commit.message)}</div>
                <div>{c.commit.message}</div>
                {c.missing && <div className="font-bold underline cursor-pointer" onClick={() => cherryPick(c.sha, c.commit)}>Pick</div>}
            </li>)}
        </ul>
    </div>
}
