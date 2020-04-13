import React from "react"
import {interpret} from "xstate"
import { useService } from "@xstate/react";

const getStateComponents = (meta = {}) => {
    return Object.keys(meta).reduce((previous, key) => {
        return meta[key].component && [...previous, meta[key].component] || previous
    }, [])
}

const componentCreator = ({service, ...props}) => {
    const [state, send] = useService(service)
    const components = getStateComponents(state?.meta);
    const Children = Object.keys(state.children).map(key => ({
            components: getStateComponents(state.children[key].state?.meta),
            state: state.children[key].state,
            send: state.children[key].send
        }))
        .filter(c => c.components)
    return components.map(Component => (<Component send={send} {...state.context} {...props}>
        {Children.map(c => {
            const children = c.components
            return children.map(Child => <Child send={c.send} {...c.state.context}/>)
        })}
    </Component>))
}

export const createMachineUI = (machine, options = {}) => {
    if (machine) {
        const service = interpret(machine.withConfig(options));
        service.start();
        return ({...props}) => componentCreator({service, ...props})
    }
    return componentCreator
}
