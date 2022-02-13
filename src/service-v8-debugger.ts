import Log  from '@qml-debug/log';
import Packet from '@qml-debug/packet';

import { QmlDebugSession } from '@qml-debug/debug-adapter';
import {
    QmlRequest,
    QmlResponse,
    isQmlVersionRequest,
    QmlVersionResponse,
    isQmlVersionResponse,
    QmlSetBreakpointArguments,
    isQmlSetBreakpointRequest,
    QmlSetBreakpointResponse,
    isQmlSetBreakpointResponse,
    QmlClearBreakpointArguments,
    isQmlClearBreakpointRequest,
    QmlClearBreakpointResponse,
    isClearSetBreakpointResponse,
    QmlSetExceptionBreakArguments,
    isQmlSetExceptionBreakRequest,
    QmlSetExceptionBreakResponse,
    isQmlSetExceptionBreakResponse,
    QmlBacktraceArguments,
    isQmlBacktraceRequest,
    QmlBacktraceResponse,
    isQmlBacktraceResponse,
    QmlFrameRequestArguments,
    isQmlFrameRequest,
    QmlFrameResponse,
    isQmlFrameResponse,
    QmlScopeRequestArguments,
    isQmlScopeRequest,
    isQmlScopeResponse,
    QmlScopeResponse,
    QmlLookupRequestArguments,
    isQmlLookupRequest,
    QmlLookupResponse,
    isQmlLookupResponse,
    QmlEvalutaRequestArguments,
    isQmlEvalutaRequest,
    QmlEvaluateResponse,
    isQmlEvaluateResponse,
    QmlContinueRequestArguments,
    isQmlContinueRequest,
    QmlContinueResponse,
    isQmlContinueResponse,
    isQmlEvent,
    isQmlMessage,
    isQmlResponse
} from '@qml-debug/qml-messages';

interface ServiceAwaitingRequest
{
    seqId : number;
    resolve: (value? : QmlResponse<any>) => void;
    reject: (value : Error) => void;
    timeoutId : NodeJS.Timeout;
    responseCheckFunction: (value : any) => boolean;
    autoReject : boolean;
};

export default class ServiceV8Debugger
{
    private seqId = -1;
    private session? : QmlDebugSession;
    private awaitingRequests : ServiceAwaitingRequest[] = [];
    private connectRequest?: ServiceAwaitingRequest;
    private requestTimeOut = 600000;

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
            const message = packet.readJsonUTF8();

            if (!isQmlMessage(message))
                throw Error("Message format check failed. Sequence Number: " + message.seq);

            if (message.type === "response")
            {
                if (!isQmlResponse(message))
                    throw Error("Response base format check failed.");

                for (let i = 0; i < this.awaitingRequests.length; i++)
                {
                    const current = this.awaitingRequests[i];
                    if (current.seqId !== message.request_seq)
                        continue;

                    this.finishOrCancelRequest(current.seqId);

                    if (current.autoReject && !message.success)
                        current.reject(new Error("V8Debugger: Command failed. Sequence Number: " + message.request_seq + ", Command: " + message.command));

                    if (message.success && !current.responseCheckFunction(message))
                    {
                        current.reject(new Error("Response format check failed. Sequence Number (Request Seq Number): " + message.seq + "(" + message.request_seq + ")" + ", Command: " + message.command));
                        return;
                    }

                    current.resolve(message);

                    return;
                }

                Log.error("V8Debugger: Packet with wrong sequence id received. Sequence Id: " + message.request_seq  + ", Operation: " + operation);
            }
            else if (message.type === "event")
            {
                if (!isQmlEvent(message))
                    throw Error("Event format check failed. Sequence Number: " + message.seq);

                this.session!.onEvent(message);
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

    private nextSeq() : number
    {
        this.seqId++;
        return this.seqId;
    }

    private makeRequest<ArgumentType, ResponseType>(requestCommand : string, requestArgs : ArgumentType, requestCheckFunction : any, responseCheckFunctionParam : any, autoReject? : boolean) : Promise<ResponseType>
    {
        Log.trace("ServiceV8Debugger.makeRequest", [ requestCommand, requestArgs ]);

        if (autoReject === undefined)
            autoReject = true;

        return new Promise<any>(
            async (resolveParam, rejectParam) =>
            {
                const packet = new Packet();
                packet.appendStringUTF8("V8DEBUG");
                packet.appendStringUTF8("v8request");
                const seq = this.nextSeq();

                const request : QmlRequest<ArgumentType> =
                {
                    type: "request",
                    command: requestCommand,
                    seq: seq,
                    arguments: requestArgs
                };

                if (!requestCheckFunction(request))
                    throw Error("Request format check failed. Command: " + requestCommand + ", Arguments: " + requestArgs);

                packet.appendJsonUTF8(request);

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
                        timeoutId: tId,
                        responseCheckFunction: responseCheckFunctionParam,
                        autoReject: autoReject!
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

    public async requestVersion() : Promise<QmlVersionResponse>
    {
        Log.trace("ServiceV8Debugger.requestBacktrace", []);

        const response = await this.makeRequest<null, QmlVersionResponse>(
            "version",
            null,
            isQmlVersionRequest,
            isQmlVersionResponse
        );

        return response;
    }

    public async requestSetBreakpoint(filenameParam : string, lineParam : number) : Promise<QmlSetBreakpointResponse>
    {
        Log.trace("ServiceV8Debugger.requestSetBreakpoint", [ filenameParam, lineParam ]);

        const response = await this.makeRequest<QmlSetBreakpointArguments, QmlSetBreakpointResponse>(
            "setbreakpoint",
            {
                type: "scriptRegExp",
                target: filenameParam,
                line: lineParam,
                enabled: true
            },
            isQmlSetBreakpointRequest,
            isQmlSetBreakpointResponse
        );

        return response;
    }

    public async requestClearBreakpoint(idParam : number) : Promise<QmlClearBreakpointResponse>
    {
        Log.trace("ServiceV8Debugger.requestClearBreakpoint", [ idParam ]);

        const response = await this.makeRequest<QmlClearBreakpointArguments, QmlClearBreakpointResponse>(
            "clearbreakpoint",
            {
                breakpoint: idParam
            },
            isQmlClearBreakpointRequest,
            isClearSetBreakpointResponse
        );

        return response;
    }

    public async requestSetExceptionBreakpoint(typeParam : string, enabledParam : boolean) : Promise<QmlSetExceptionBreakResponse>
    {
        Log.trace("ServiceV8Debugger.requestSetExceptionBreakpoint", [ typeParam, enabledParam ]);

        const response = await this.makeRequest<QmlSetExceptionBreakArguments, QmlSetExceptionBreakResponse>(
            "setexceptionbreak",
            {
                type: typeParam,
                enabled: enabledParam
            },
            isQmlSetExceptionBreakRequest,
            isQmlSetExceptionBreakResponse
        );

        return response;
    }

    public async requestBacktrace() : Promise<QmlBacktraceResponse>
    {
        Log.trace("ServiceV8Debugger.requestBacktrace", []);

        const response = await this.makeRequest<QmlBacktraceArguments, QmlBacktraceResponse>(
            "backtrace",
            {

            },
            isQmlBacktraceRequest,
            isQmlBacktraceResponse
        );

        return response;
    }

    public async requestFrame(frameId : number) : Promise<QmlFrameResponse>
    {
        Log.trace("ServiceV8Debugger.requestFrame", [ frameId ]);

        const response = await this.makeRequest<QmlFrameRequestArguments, QmlFrameResponse>(
            "frame",
            {
                number: frameId
            },
            isQmlFrameRequest,
            isQmlFrameResponse
        );

        return response;
    }

    public async requestScope(scopeId : number) : Promise<QmlScopeResponse>
    {
        Log.trace("ServiceV8Debugger.requestScope", [ scopeId ]);

        const response = await this.makeRequest<QmlScopeRequestArguments, QmlScopeResponse>(
            "scope",
            {
                number: scopeId
            },
            isQmlScopeRequest,
            isQmlScopeResponse,
        );

        return response;
    }

    public async requestLookup(handlesParam : number[]) : Promise<QmlLookupResponse>
    {
        Log.trace("ServiceV8Debugger.requestLookup", [ handlesParam ]);

        const response = await this.makeRequest<QmlLookupRequestArguments, QmlLookupResponse>(
            "lookup",
            {
                handles: handlesParam
            },
            isQmlLookupRequest,
            isQmlLookupResponse
        );

        return response;
    }

    public async requestEvaluate(frameId : number, expressionParam : string) : Promise<QmlEvaluateResponse>
    {
        Log.trace("ServiceV8Debugger.requestLookup", [ frameId, expressionParam ]);

        const response = await this.makeRequest<QmlEvalutaRequestArguments, QmlEvaluateResponse>(
            "evaluate",
            {
                frame: frameId,
                expression: expressionParam
            },
            isQmlEvalutaRequest,
            isQmlEvaluateResponse,
            false
        );

        return response;
    }

    public async requestContinue(stepAction? : "in" | "out" | "next", stepCount? : 1) : Promise<QmlContinueResponse>
    {
        Log.trace("ServiceV8Debugger.requestContinue", []);

        const result = await this.makeRequest<QmlContinueRequestArguments, QmlContinueResponse>(
            "continue",
            {
                stepaction: stepAction,
                stepcount: stepCount
            },
            isQmlContinueRequest,
            isQmlContinueResponse
        );

        return result;
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
                    timeoutId: tId,
                    responseCheckFunction: (value : any) =>  { return true; },
                    autoReject: true
                };

                await this.session!.packetManager!.writePacket(envelopePacket);
            }
        );
    }

    public async disconnect() : Promise<void>
    {
        this.requestContinue();

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

        const versionResponse = await this.requestVersion();
        Log.info("V8 Service Version: " + versionResponse.body.V8Version);
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
