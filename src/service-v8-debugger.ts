import { QmlDebugSession } from './debug-adapter';
import Log  from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import PacketManager from '@qml-debug/packet-manager';

interface ServiceAwaitingRequest
{
    seqId : number;
    resolve: any;
    reject: any;
    timerId : NodeJS.Timeout;
};


export default class ServiceV8Debugger
{
    private seqId = 0;
    private session? : QmlDebugSession;
    private packetManager? : PacketManager;
    private awaitingRequests : ServiceAwaitingRequest[] = [];
    private connectRequest?: ServiceAwaitingRequest;

    private packetReceived(packet : Packet)
    {
        Log.trace("ServiceV8Debugger.packetReceived", [ packet ]);

        packet.readStringUTF8();
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

                    this.cancelRequest(current.seqId);

                    if (!innerPacket.success)
                        current.reject(new Error("Operation failed. Sequence Number: " + innerPacket.request_seq + ", Operation: " + innerPacket.command));
                    else
                        current.resolve(innerPacket.body);

                    return;
                }

                Log.error("Packet with wrong sequence id received. Sequence Id: " + innerPacket.request_seq  + ", Operation: " + operation);
            }
            else if (innerPacket.type === "event")
            {
                if (innerPacket.event === "break")
                {
                    const innerPacket = packet.readJsonUTF8();
                    this.session?.onBreak(innerPacket.body.script.name as string, innerPacket.body.sourceline as number);
                }
            }
        }
        else if (operation === "connect")
        {
            if (this.connectRequest === undefined)
                return;

            clearTimeout(this.connectRequest.timerId);
            this.connectRequest.resolve(packet.readJsonUTF8());
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
            (resolveParam, rejectParam) =>
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

                const timerId = setTimeout(
                    () =>
                    {
                        this.cancelRequest(seq);
                        rejectParam(new Error("Request timed out. Sequence Id: " + seq));
                    },
                    10000
                );

                this.awaitingRequests.push(
                    {
                        seqId: seq,
                        resolve: resolveParam,
                        reject: rejectParam,
                        timerId: timerId
                    }
                );

                this.packetManager!.writePacket(envelopPacket);
            }
        );
    }

    private cancelRequest(seqId : number)
    {
        Log.trace("ServiceV8Debugger.cancelRequest", [ seqId ]);

        const current = this.awaitingRequests[seqId];
        this.awaitingRequests = this.awaitingRequests.splice(seqId, 1);
        clearTimeout(current.timerId);
    }

    public async requestBacktrace() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.requestBacktrace", []);

        await this.makeRequest("backtrace", { });
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

    public async requestSetBreakpoint(filenameParam : string, lineParam : number) : Promise<number>
    {
        Log.trace("ServiceV8Debugger.requestSetBreakpoint", [ filenameParam, lineParam ]);

        const response = await this.makeRequest("setbreakpoint",
            {
                type: "scriptRegExp",
                target: filenameParam,
                line: lineParam,
                ignoreCount: 0,
                enabled: true,
            }
        );

        return response.breakpoint as number;
    }

    public async requestRemoveBreakpoint(idParam : number)
    {
        Log.trace("ServiceV8Debugger.requestRemoveBreakpoint", [ idParam ]);

        await this.makeRequest("clearbreakpoint",
            {
                breakpoint: idParam
            }
        );
    }

    public connect() : Promise<any>
    {
        Log.trace("ServiceV8Debugger.connect", []);

        return new Promise<any>(
            (resolveParam, rejectParam) =>
            {
                const packet = new Packet();
                packet.appendStringUTF8("V8DEBUG");
                packet.appendStringUTF8("connect");
                packet.appendJsonUTF8({});

                const envelopePacket = new Packet();
                envelopePacket.appendStringUTF16("V8Debugger");
                envelopePacket.appendSubPacket(packet);

                this.connectRequest =
                {
                    seqId: -1,
                    resolve: resolveParam,
                    reject: rejectParam,
                    timerId:
                        setTimeout(
                            () =>
                            {
                                rejectParam(new Error("Connect request timed out."));
                            },
                            10000
                        )
                };
                this.packetManager!.writePacket(envelopePacket);
            }
        );
    }

    public async handshake() : Promise<void>
    {
        Log.trace("ServiceV8Debugger.handshake", []);

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

    public constructor(packetManager : PacketManager)
    {
        Log.trace("ServiceV8Debugger.constructor", [ packetManager ]);

        this.packetManager = packetManager;
        this.packetManager.registerHandler("V8Debugger",
            (header, packet) : boolean =>
            {
                const servicePacket = packet.readSubPacket();
                this.packetReceived(servicePacket);

                return true;
            }
        );
    }
};
