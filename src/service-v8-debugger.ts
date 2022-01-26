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
    private packetManager? : PacketManager;
    private awaitingRequests : ServiceAwaitingRequest[] = [];

    private packetReceived(packet : Packet)
    {
        Log.trace("ServiceV8Debugger.packetReceived", [ packet ]);

        const operation = packet.readStringUTF8();
        const innerPacket = packet.readJsonUTF8();
        if (innerPacket.type === "response")
        {
            for (let i = 0; i < this.awaitingRequests.length; i++)
            {
                const current = this.awaitingRequests[i];
                if (current.seqId === innerPacket.request_seq)
                {
                    this.awaitingRequests = this.awaitingRequests.splice(i, 1);
                    clearTimeout(current.timerId);

                    if (!innerPacket.success)
                        current.reject(new Error("Operation failed. Sequence Number: " + innerPacket.request_seq + ", Operation: " + innerPacket.command));
                    else
                        current.resolve(innerPacket.body);
                    return;
                }
            }
        }
        else if (innerPacket.type === "event")
        {
            if (innerPacket.event === "break")
            {

            }
        }

        Log.error("Packet with wrong sequence id received. Sequence Id: " + innerPacket.request_seq  + ", Operation: " + operation);
    }

    private nextSeqId() : number
    {
        this.seqId++;
        return this.seqId;
    }

    private makeRequest(command : string, args : any) : Promise<any>
    {
        Log.trace("ServiceV8Debugger.makeRequest", [ command, args ]);

        return new Promise<any>(
            (resolve, reject) =>
            {
                const packet = new Packet();
                packet.appendStringUTF8("V8DEBUG");
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
                envelopPacket.appendStringUTF16("QmlDebugger");
                envelopPacket.appendSubPacket(packet);

                const timerId = setTimeout(
                    () =>
                    {
                        reject(new Error("Request timed out. Sequence Id: " + seq));
                    },
                    10000
                );

                this.awaitingRequests.push(
                    {
                        seqId: seq,
                        resolve: resolve,
                        reject: reject,
                        timerId: timerId
                    }
                );

                this.packetManager!.writePacket(envelopPacket);
            }
        );
    }

    public async requestBacktrace() : Promise<void>
    {

        await this.makeRequest("backtrace", { });
    }

    public async requestStepIn() : Promise<void>
    {
        await this.makeRequest("continue",
            {
                stepaction: "in",
                stepcount: 1
            }
        );
    }

    public async requestStepOut() : Promise<void>
    {
        await this.makeRequest("continue",
            {
                stepaction: "out",
                stepcount: 1
            }
        );
    }

    public async requestStepOver() : Promise<void>
    {
        await this.makeRequest("continue",
            {
                stepaction: "next",
                stepcount: 1
            }
        );
    }

    public async requestContinue() : Promise<void>
    {
        await this.makeRequest("continue", { });
    }

    public async requestSetBreakpoint(filenameParam : string, lineParam : number) : Promise<number>
    {
        const response = await this.makeRequest("setbreakpoint",
            {
                type: "scriptRegEx",
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
        const packet = new Packet();
        packet.appendJsonUTF8(
            {
                id: idParam
            }
        );
        await this.makeRequest("removebreakpoint",
            {
            }
        );
    }

    public async initialize() : Promise<void>
    {

    }

    public async deinitialize() : Promise<void>
    {

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
