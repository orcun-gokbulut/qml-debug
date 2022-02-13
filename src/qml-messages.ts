import
{
    QmlBacktrace,
    isQmlBacktrace,
    QmlFrame,
    isQmlFrame,
    QmlScope,
    isQmlScope,
    QmlVariable,
    isQmlVariable,
    QmlBreakpoint,
    isQmlBreakpoint
} from '@qml-debug/qml-types';


// MESSAGE
///////////////////////////////////////////////////////////////////////

export interface QmlMessage
{
    type : "request" | "event" | "response";
    seq : number;
};

export function isQmlMessage(value : any) : value is QmlMessage
{
    if (typeof value !== "object" ||
        typeof value.type !== "string" ||
        typeof value.seq !== "number")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// REQUEST
///////////////////////////////////////////////////////////////////////

export interface QmlRequest<QmlArgumentsType> extends QmlMessage
{
    type : "request";
    command : string;
    arguments : QmlArgumentsType;
};

export function isQmlRequest(value : any) : value is QmlRequest<any>
{
    if (!isQmlMessage(value) ||
        value.type !== "request" ||
        typeof (value as any).arguments !== "object")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// RESPONSE
///////////////////////////////////////////////////////////////////////

export interface QmlResponse<QmlResponseBody> extends QmlMessage
{
    type : "response";
    /* eslint-disable */
    request_seq : number;
    /* eslint-enable */
    command : string;
    success : boolean;
    running : boolean;
    body : QmlResponseBody;
};

export function isQmlResponse(value : any) : value is QmlResponse<any>
{
    if (!isQmlMessage(value as any) ||
        value.type !== "response" ||
        typeof value.request_seq !== "number" ||
        typeof value.command !== "string" ||
        typeof value.success !== "boolean" ||
        typeof value.running !== "boolean")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// EVENT
///////////////////////////////////////////////////////////////////////

export interface QmlEvent<QmlEventBody> extends QmlMessage
{
    type : "event";
    event : string;
    body : QmlEventBody;
};

export function isQmlEvent<QmlEventBody>(value : any) : value is QmlEvent<QmlEventBody>
{
    if (!isQmlMessage(value as any) ||
        value.type !== "event" ||
        typeof value.event !== "string")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// VERSION
///////////////////////////////////////////////////////////////////////

export interface QmlVersionRequest extends QmlRequest<null>
{

};

export function isQmlVersionRequest(value : any) : value is QmlVersionRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "version" ||
        value.arguments !== null)
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlVersionBody
{
    /* eslint-disable */
    ChangeBreakpoint : boolean;
    ContextEvaluate : boolean;
    UnpausedEvaluate : boolean;
    V8Version : string;
    /* eslint-enable */
};

export function isQmlVersionBody(value : any) : value is QmlVersionBody
{
    if (typeof value !== "object" ||
        typeof value.ChangeBreakpoint !== "boolean" ||
        typeof value.ContextEvaluate !== "boolean" ||
        typeof value.UnpausedEvaluate !== "boolean" ||
        typeof value.V8Version !== "string")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}
export interface QmlVersionResponse extends QmlResponse<QmlVersionBody>
{
    command : "version";
};

export function isQmlVersionResponse(value : any) : value is QmlVersionResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "version" ||
        !isQmlVersionBody(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// SET BREAKPOINT
///////////////////////////////////////////////////////////////////////

export interface QmlSetBreakpointArguments
{
    type : string,
    target : string,
    line : number
    enabled : boolean,
};

export function isQmlSetBreakpointArguments(value : any) : value is QmlSetBreakpointArguments
{
    if (typeof value !== "object" ||
        typeof value.type !== "string" ||
        typeof value.target !== "string" ||
        typeof value.line !== "number" ||
        typeof value.enabled !== "boolean")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlSetBreakpointRequest extends QmlRequest<QmlSetBreakpointArguments>
{

};

export function isQmlSetBreakpointRequest(value : any) : value is QmlSetBreakpointRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "setbreakpoint" ||
        !isQmlSetBreakpointArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlSetBreakpointResponse extends QmlResponse<QmlBreakpoint>
{
    command : "breakpoint";
};

export function isQmlSetBreakpointResponse(value : any) : value is QmlSetBreakpointResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "setbreakpoint" ||
        !isQmlBreakpoint(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// CLEAR BREAKPOINT
///////////////////////////////////////////////////////////////////////

export interface QmlClearBreakpointArguments
{
    breakpoint : number
};

export function isQmlCancelBreakpointArguments(value : any) : value is QmlClearBreakpointArguments
{
    if (typeof value !== "object" ||
        typeof value.breakpoint !== "number")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlClearBreakpointRequest extends QmlRequest<QmlClearBreakpointArguments>
{

};

export function isQmlClearBreakpointRequest(value : any) : value is QmlClearBreakpointRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "clearbreakpoint" ||
        !isQmlClearBreakpointRequest(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlClearBreakpointResponse extends QmlResponse<undefined>
{
    command : "clearbreakpoint";
};

export function isClearSetBreakpointResponse(value : any) : value is QmlClearBreakpointResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "clearbreakpoint")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// SET EXCEPTION BREAK
///////////////////////////////////////////////////////////////////////

export interface QmlSetExceptionBreakArguments
{
    type : string,
    enabled : boolean
};

export function isQmlSetExceptionBreakArguments(value : any) : value is QmlSetExceptionBreakArguments
{
    if (typeof value !== "object" ||
        typeof value.type !== "string" ||
        typeof value.enabled !== "boolean")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlSetExceptionBreakRequest extends QmlRequest<QmlSetExceptionBreakArguments>
{

};

export function isQmlSetExceptionBreakRequest(value : any) : value is QmlSetExceptionBreakRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "setexceptionbreak" ||
        !isQmlSetExceptionBreakArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlSetExceptionBreakResponse extends QmlResponse<QmlSetExceptionBreakArguments>
{
    command : "setexceptionbreak";
};

export function isQmlSetExceptionBreakResponse(value : any) : value is QmlSetExceptionBreakResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "setexceptionbreak" ||
        !isQmlSetExceptionBreakArguments(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// BREAK
///////////////////////////////////////////////////////////////////////

export interface QmlBreakEventBody
{
    breakpoints : number[];
    invocationText : string;
    script: {
        name : string;
    };
    sourceLine : number;
};

export function isQmlBreakEventBody(value : any) : value is QmlBreakEventBody
{
    if (typeof value !== "object" ||
        typeof value.invocationText !== "string" ||
        typeof value.script !== "object" ||
        typeof value.script.name !== "string" ||
        typeof value.sourceLine !== "number" ||
        !Array.isArray(value.breakpoints))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    for (const breakpointId of value.breakpoints)
    {
        if (typeof breakpointId !== "number")
            return false;
    }

    return true;
}
export interface QmlBreakEvent extends QmlEvent<QmlBreakEventBody>
{
    command : "breakpoint";
};

export function isQmlBreakEvent(value : any) : value is QmlBreakEvent
{
    if (!isQmlEvent(value) ||
        value.event !== "break" ||
        !isQmlBreakEventBody(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

// CONTINUE
///////////////////////////////////////////////////////////////////////

export interface QmlContinueRequestArguments
{
    stepaction? : "in" | "out" | "next",
    stepcount? : 1 | undefined
};

export function isQmlContinueRequestArguments(value : any) : value is QmlContinueRequestArguments
{
    if (typeof value !== "object" ||
        (value.stepaction !== undefined && typeof value.stepaction !== "string") ||
        (value.stepcount !== undefined && typeof value.stepcount !== "number"))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlContinueRequest extends QmlRequest<QmlContinueRequestArguments>
{

};

export function isQmlContinueRequest(value : any) : value is QmlContinueRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "continue" ||
        !isQmlContinueRequestArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlContinueResponse extends QmlResponse<undefined>
{
    command : "continue";
};

export function isQmlContinueResponse(value : any) : value is QmlContinueResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "continue")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// BACKTRACE
///////////////////////////////////////////////////////////////////////

export interface QmlBacktraceArguments
{

};

export function isQmlBacktraceArguments(value : any) : value is QmlBacktraceArguments
{
    if (typeof value !== "object")
        return false;

    return true;
}

export interface QmlBacktraceRequest extends QmlRequest<QmlBacktraceArguments>
{

};

export function isQmlBacktraceRequest(value : any) : value is QmlBacktraceRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "backtrace" ||
        !isQmlBacktraceArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlBacktraceResponse extends QmlResponse<QmlBacktrace>
{
    command : "backtrace";
};

export function isQmlBacktraceResponse(value : any) : value is QmlBacktraceResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "backtrace" ||
        !isQmlBacktrace(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// FRAME
///////////////////////////////////////////////////////////////////////

export interface QmlFrameRequestArguments
{
    number: number;
};

export function isQmlFrameRequestArguments(value : any) : value is QmlFrameRequestArguments
{
    if (typeof value !== "object" ||
        typeof value.number !== "number")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}
export interface QmlFrameRequest extends QmlRequest<QmlFrameRequestArguments>
{

};

export function isQmlFrameRequest(value : any) : value is QmlFrameRequest
{
    if (!isQmlRequest(value) ||
        !isQmlFrameRequestArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlFrameResponse extends QmlResponse<QmlFrame>
{

};

export function isQmlFrameResponse(value : any) : value is QmlFrameResponse
{
    if (!isQmlResponse(value) ||
        !isQmlFrame((value as any).body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// SCOPE
///////////////////////////////////////////////////////////////////////

export interface QmlScopeRequestArguments
{
    number : number;
};

export function isQmlScopeRequestArgument(value : any) : value is QmlScopeRequestArguments
{
    if (typeof value !== "object" ||
        typeof value.number !== "number")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlScopeRequest extends QmlRequest<QmlScopeRequestArguments>
{

};

export function isQmlScopeRequest(value : any) : value is QmlScopeRequest
{
    if (!isQmlRequest(value) ||
        !isQmlFrameRequestArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlScopeResponse extends QmlResponse<QmlScope>
{

};

export function isQmlScopeResponse(value : any) : value is QmlScopeRequest
{
    if (!isQmlResponse(value) ||
        !isQmlScope(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}


// Lookup
///////////////////////////////////////////////////////////////////////

export interface QmlLookupRequestArguments
{
    handles : number[];
};

export function isQmlLookupRequestArgument(value : any) : value is QmlLookupRequestArguments
{
    if (typeof value !== "object")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    if (!Array.isArray(value.handles))
        return false;

    for (const element of value.handles)
    {
        if (typeof element !== "number")
            return false;
    }

    return true;
}

export interface QmlLookupRequest extends QmlRequest<QmlLookupRequestArguments>
{

};

export function isQmlLookupRequest(value : any) : value is QmlLookupRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "lookup" ||
        !isQmlLookupRequestArgument(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlLookupBody
{
    [ index: string ] : QmlVariable;
};


export interface QmlLookupResponse extends QmlResponse<QmlLookupBody>
{

};

export function isQmlLookupResponse(value : any) : value is QmlLookupResponse
{
    if (!isQmlResponse(value as any) ||
        value.command !== "lookup" ||
        typeof value.body !== "object")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }


    for (const [ key, variable ] of Object.entries(value.body))
    {
        if (typeof key !== "string")
            return false;

        if (!isQmlVariable(variable))
            return false;
    }

    return true;
}


// EVALUATE
///////////////////////////////////////////////////////////////////////

export interface QmlEvalutaRequestArguments
{
    frame : number;
    expression : string;
};

export function isQmlEvalutaRequestArguments(value : any) : value is QmlEvalutaRequestArguments
{
    if (typeof value !== "object" ||
        typeof value.frame !== "number" ||
        typeof value.expression !== "string")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlEvalutaRequest extends QmlRequest<QmlEvalutaRequestArguments>
{

};

export function isQmlEvalutaRequest(value : any) : value is QmlEvalutaRequest
{
    if (!isQmlRequest(value) ||
        value.command !== "evaluate" ||
        !isQmlEvalutaRequestArguments(value.arguments))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlEvaluateResponse extends QmlResponse<QmlVariable>
{

};

export function isQmlEvaluateResponse(value : any) : value is QmlLookupResponse
{
    if (!isQmlResponse(value) ||
        value.command !== "evaluate" ||
        !isQmlVariable(value.body))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}
