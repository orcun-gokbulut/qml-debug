import Log  from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import { QmlDebugSession } from '@qml-debug/debug-adapter';


export interface QmlBacktrace
{
    fromFrame : number;
    toFrame : number;
    frames : QmlFrame[];
};

function isQmlBacktrace(value : any) : value is QmlBacktrace
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
};

function isQmlFrame(value : any) : value is QmlFrame
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
};

function isQmlScope(value : any) : value is QmlScope
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

        if (value.object.handle !== undefined && typeof value.handle !== "number")
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
};

function isQmlVariable(value : any) : value is QmlVariable
{
    if (typeof value !== "object" ||
        typeof value.type !== "number" ||
        value.value === undefined)
    {
        /* eslint-disable */
        return false;
        /* eslint-enable */
    }

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
interface ServiceAwaitingRequest
{
    seqId : number;
    resolve: any;
    reject: any;
    timeoutId : NodeJS.Timeout;
};

export default class ServiceV8Debugger
{
    private seqId = -1;
    private session? : QmlDebugSession;
    private awaitingRequests : ServiceAwaitingRequest[] = [];
    private connectRequest?: ServiceAwaitingRequest;
    private requestTimeOut = 5000;

    private packetReceived(packet : Packet)
    {
        Log.trace("ServiceV8Debugger.packetReceived", [ packet ]);

        const header = packet.readStringUTF8();
        if (header !== "V8DEBUG")
        {
            Log.error("V8Debugger: Packet with wrong header received.");
            return;
        }

        const operation = packet.readStringUTF8();

        if (operation === "v8message")
        {
            const innerPacket = packet.readJsonUTF8();
            if (innerPacket.type === "response")
            {
                for (let i = 0; i < this.awaitingRequests.length; i++)
                {
                    const current = this.awaitingRequests[i];
                    if (current.seqId !== innerPacket.request_seq)
                        continue;

                    this.finishOrCancelRequest(current.seqId);

                    if (!innerPacket.success)
                        current.reject(new Error("V8Debugger: Operation failed. Sequence Number: " + innerPacket.request_seq + ", Operation: " + innerPacket.command));
                    else
                        current.resolve(innerPacket.body);

                    return;
                }

                Log.error("V8Debugger: Packet with wrong sequence id received. Sequence Id: " + innerPacket.request_seq  + ", Operation: " + operation);
            }
            else if (innerPacket.type === "event")
            {
                if (innerPacket.event === "break")
                    this.session!.onBreak(innerPacket.body.script.name as string, innerPacket.body.sourceLine as number);
            }
        }
        else if (operation === "connect")
        {
            if (this.connectRequest === undefined)
                return;

            clearTimeout(this.connectRequest.timeoutId);
            this.connectRequest.resolve();
        }
    }

    private nextSeqId() : number
    {
        this.seqId++;
        return this.seqId;
    }

    private makeRequest(command : string, args : any | null) : Promise<any>
    {
        Log.trace("ServiceV8Debugger.makeRequest", [ command, args ]);

        return new Promise<any>(
            async (resolveParam, rejectParam) =>
            {
                const packet = new Packet();
                packet.appendStringUTF8("V8DEBUG");
                packet.appendStringUTF8("v8request");
                const seq = this.nextSeqId();
                packet.appendJsonUTF8(
                    {
                        type: "request",
                        command: command,
                        seq: seq,
                        arguments: args
                    }
                );

                const envelopPacket = new Packet();
                envelopPacket.appendStringUTF16("V8Debugger");
                envelopPacket.appendSubPacket(packet);

                const tId = setTimeout(
                    () =>
                    {
                        this.finishOrCancelRequest(seq);
                        rejectParam(new Error("V8Debugger: Request timed out. Sequence Id: " + seq));
                    },
                    this.requestTimeOut
                );

                this.awaitingRequests.push(
                    {
                        seqId: seq,
                        resolve: resolveParam,
                        reject: rejectParam,
                        timeoutId: tId
                    }
                );

                await this.session!.packetManager!.writePacket(envelopPacket);
            }
        );
    }

    private finishOrCancelRequest(seqId : number)
    {
        Log.trace("ServiceV8Debugger.cancelRequest", [ seqId ]);

        for (let i = 0; i < this.awaitingRequests.length; i++)
        {
            const current = this.awaitingRequests[i];
            if (current.seqId !== seqId)
                continue;

            clearTimeout(current.timeoutId);
            this.awaitingRequests.splice(i, 1);
        }
    }

    public async requestSetBreakpoint(filenameParam : string, lineParam : number) : Promise<number>
    {
        Log.trace("ServiceV8Debugger.requestSetBreakpoint", [ filenameParam, lineParam ]);

        const response = await this.makeRequest("setbreakpoint",
            {
                type: "scriptRegExp",
                target: filenameParam,
                line: lineParam - 1,
                enabled: true
            }
        );

        return response.breakpoint as number;
    }

    public async requestRemoveBreakpoint(idParam : number) : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestRemoveBreakpoint", [ idParam ]);

        await this.makeRequest("clearbreakpoint",
            {
                breakpoint: idParam
            }
        );
    }

    public async requestSetExceptionBreakpoint(typeParam : string, enabledParam : boolean) : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestSetExceptionBreakpoint", [ typeParam, enabledParam ]);
        await this.makeRequest("setexceptionbreak", { type: typeParam, enabled: enabledParam });
    }

    public async requestBacktrace() : Promise<QmlBacktrace>
    {
        Log.trace("ServiceV8Debugger.requestBacktrace", []);

        const response = await this.makeRequest("backtrace", {});

        if (!isQmlBacktrace(response))
            throw new Error("Response of backtrace request has invalid format.");

        return response;
    }

    public async requestFrame(frameId : number) : Promise<QmlFrame>
    {
        Log.trace("ServiceV8Debugger.requestFrame", [ frameId ]);

        const response = await this.makeRequest("frame", { number: frameId });

        if (!isQmlFrame(response))
            throw new Error("Response of frame request has invalid format.");

        return response;
    }

    public async requestScope(scopeId : number) : Promise<QmlScope>
    {
        Log.trace("ServiceV8Debugger.requestScope", [ scopeId ]);

        const response = await this.makeRequest("scope", { number: scopeId });

        if (!isQmlScope(response))
            throw new Error("Response of scope request has invalid format.");

        return response;
    }

    public async requestLookup(handlesParam : number[]) : Promise<QmlVariable[]>
    {
        Log.trace("ServiceV8Debugger.requestLookup", [ handlesParam ]);

        const response = await this.makeRequest("lookup", { handles: handlesParam });

        if (typeof response !== "object")
            throw new Error("Response of lookup request has invalid format.");

        const variables : QmlVariable[] = [];
        for (const variable of response)
        {
            if (!isQmlVariable(variable))
                continue;

            variables.push(variable);
        }

        return variables;
    }

    public async requestStepIn() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestStepIn", []);

        await this.makeRequest("continue",
            {
                stepaction: "in",
                stepcount: 1
            }
        );
    }

    public async requestStepOut() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestStepOut", []);

        await this.makeRequest("continue",
            {
                stepaction: "out",
                stepcount: 1
            }
        );
    }

    public async requestStepOver() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestStepOver", []);

        await this.makeRequest("continue",
            {
                stepaction: "next",
                stepcount: 1
            }
        );
    }

    public async requestContinue() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestContinue", []);

        await this.makeRequest("continue", { });
    }

    public connect() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.connect", []);

        return new Promise<any>(
            async (resolveParam, rejectParam) =>
            {
                const packet = new Packet();
                packet.appendStringUTF8("V8DEBUG");
                packet.appendStringUTF8("connect");
                packet.appendJsonUTF8({});

                const envelopePacket = new Packet();
                envelopePacket.appendStringUTF16("V8Debugger");
                envelopePacket.appendSubPacket(packet);

                const tId = setTimeout(
                    () =>
                    {
                        rejectParam(new Error("V8Debugger: Connect request timed out."));
                    },
                    this.requestTimeOut
                );

                this.connectRequest =
                {
                    seqId: -1,
                    resolve: resolveParam,
                    reject: rejectParam,
                    timeoutId: tId
                };

                await this.session!.packetManager!.writePacket(envelopePacket);
            }
        );
    }

    public async disconnect() : Promise<void>
    {
        const packet = new Packet();
        packet.appendStringUTF8("V8DEBUG");
        packet.appendStringUTF8("disconnect");
        packet.appendJsonUTF8({});

        const envelopePacket = new Packet();
        envelopePacket.appendStringUTF16("V8Debugger");
        envelopePacket.appendSubPacket(packet);

        await this.session!.packetManager!.writePacket(envelopePacket);
    }

    public async handshake() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.handshake", []);

        await this.connect();
        const versionResponse = await this.makeRequest("version", null);
        Log.info("V8 Service Version: " + versionResponse.V8Version);
    }

    public async initialize() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.initialize", []);
    }

    public async deinitialize() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.deinitialize", []);
    }

    public constructor(session : QmlDebugSession)
    {
        Log.trace("ServiceV8Debugger.constructor", [ session ]);

        this.session = session;
        this.session.packetManager.registerHandler("V8Debugger",
            (header, packet) : boolean =>
            {
                const servicePacket = packet.readSubPacket();
                this.packetReceived(servicePacket);

                return true;
            }
        );
    }
};
