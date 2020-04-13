import React from "react"
import {createPortal} from "react-dom"
import {createMachine} from 'xstate'
import {createMachineUI} from "./machine-ui"

export const confirmMachine = createMachine({
    id: 'confirm',
    initial: 'ask',
    context: {
        payload: null
    },
    states: {
        ask: {
            meta: {
                component: ({send, message = "Confirm?" }) => {
                    return createPortal(<div className="modal">
                    <div className="dialog">
                        <div>{message}</div>
                        <div className="buttons">
                            <button onClick={() => send('confirm')} className="primary">
                                Confirm
                            </button>

                            <button onClick={() => send('cancel')} className="secondary">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>, document.body)
                }
            },
            on: {
                confirm: 'confirmed',
                cancel: 'canceled'
            }
        },
        confirmed: {
            type: "final",
            data: {
                confirmed: (context, event) => context.payload
            }
        },
        canceled: {
            type: "final",
            data: {
                confirmed: false
            }
        }
    }
})

export default createMachineUI(confirmMachine)