import React from "react"
import {createPortal} from "react-dom"

export default ({onConfirm = () => {}, onCancel= () => {}, message = ""}) => {
    return createPortal(<div className="flex items-center justify-center h-screen w-screen fixed top-0 left-0">
        <div class="bg-white text-black font-bold rounded-lg border shadow-lg p-5">
            <div>{message}</div>
            <div className="p-5 text-center">
                <button onClick={onConfirm} class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded m-2">
                    Confirm
                </button>

                <button onClick={onCancel} class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded m-2">
                    Cancel
                </button>
            </div>
        </div>
    </div>, document.body)
}