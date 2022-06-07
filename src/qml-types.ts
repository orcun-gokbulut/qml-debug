export interface QmlBreakpoint
{
    breakpoint : number;
    type : string;
}

export function isQmlBreakpoint(value : any) : value is QmlBreakpoint
{
    if (typeof value !== "object" ||
        typeof value.breakpoint !== "number" ||
        typeof value.type !== "string")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    return true;
}

export interface QmlBacktrace
{
    fromFrame : number;
    toFrame : number;
    frames : QmlFrame[];
}

export function isQmlBacktrace(value : any) : value is QmlBacktrace
{
    if (typeof value !== "object" ||
        typeof value.fromFrame !== "number" ||
        typeof value.toFrame !== "number" ||
        !Array.isArray(value.frames))
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    for (const frame of value.frames)
    {
        if (!isQmlFrame(frame))
            return false;
    }

    return true;
}

export interface QmlFrame
{
    index : number;
    func : string;
    script : string;
    line: number;
    debuggerFrame : boolean;
    scopes : QmlScope[];
}

export function isQmlFrame(value : any) : value is QmlFrame
{
    if (typeof value !== "object" ||
        typeof value.index !== "number" ||
        typeof value.func !== "string" ||
        typeof value.script !== "string" ||
        typeof value.line !== "number" ||
        typeof value.debuggerFrame !== "boolean")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    if (value.scopes !== undefined)
    {
        if (!Array.isArray(value.scopes))
            return false;

        for (const scope of value.scopes)
        {
            if (!isQmlScope(scope))
                return false;
        }
    }

    return true;
}
export interface QmlScope
{
    frameIndex : number;
    index : number;
    type : number;
    object? : QmlVariable;
}

export function isQmlScope(value : any) : value is QmlScope
{
    if (typeof value !== "object" ||
        typeof value.index !== "number" ||
        typeof value.type !== "number")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    if (value.frameIndex !== undefined && typeof value.frameIndex !== "number")
        return false;

    if (value.object !== undefined)
    {

        if (value.object.handle !== undefined && typeof value.object.handle !== "number")
            return false;

        if (!isQmlVariable(value.object))
            return false;
    }

    return true;
}

export interface QmlVariable
{
    handle : number;
    name? : string;
    type : string;
    value : any;
    ref? : number;
    properties? : QmlVariable[];
}

export function isQmlVariable(value : any) : value is QmlVariable
{
    if (typeof value !== "object" ||
        typeof value.type !== "string")
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

    if (value.type !== "undefined" && value.value === undefined)
        return false;

    if (value.ref !== undefined && typeof value.ref !== "number")
        return false;

    if (value.properties !== undefined)
    {
        if (!Array.isArray(value.properties))
            return false;

        for (const property of value.properties)
        {
            if (!isQmlVariable(property))
                return false;
        }
    }

    return true;
}
