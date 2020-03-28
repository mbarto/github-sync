import React from "react"
import ReactDOM from "react-dom"
import App from "./app"
import queryString from "query-string";
import "@babel/polyfill"

const params = queryString.parse(window.location.search)

ReactDOM.render(<App params={params}/>, document.getElementById("root"))