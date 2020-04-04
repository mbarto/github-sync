import React from "react"
import {createPortal} from "react-dom"

export default ({onConfirm = () => {}, onCancel= () => {}, message = ""}) => {
    return createPortal(<div className="modal">
        <div>
            <div>{message}</div>
            <div className="buttons">
                <button onClick={onConfirm} className="primary">
                    Confirm
                </button>

                <button onClick={onCancel} className="secondary">
                    Cancel
                </button>
            </div>
        </div>
    </div>, document.body)
}