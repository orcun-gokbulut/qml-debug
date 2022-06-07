import { OutputEvent } from "@vscode/debugadapter";
import Log from "@qml-debug/log";
import Packet from "@qml-debug/packet";

import { QmlDebugSession } from "@qml-debug/debug-adapter";
import { DebugProtocol } from "@vscode/debugprotocol";


export default class ServiceDebugMessages
{
    private session? : QmlDebugSession;

    protected packetReceived(packet: Packet): void
    {
        Log.trace("ServiceDebugMessages.packetReceived", [ packet ]);

        const messageHeader = packet.readStringUTF8();
        if (messageHeader !== "MESSAGE")
            return;

        const type = packet.readInt32BE();
        const message = packet.readStringUTF8();
        const filename = packet.readStringUTF8();
        const line = packet.readInt32BE();
        const functionName = packet.readStringUTF8();
        const category = packet.readStringUTF8();
        const elapsedSeconds = Number(packet.readInt64BE() / BigInt(1000000000));

        let typeText = "";
        switch (type)
        {
            case 0:
                typeText = "Debug";
                break;

            case 1:
                typeText = "Warning";
                break;

            case 2:
                typeText = "Critical";
                break;

            case 3:
                typeText = "Fatal";
                break;

            case 4:
                typeText = "Info";
                break;

            default:
                typeText = "Unkown";
                break;
        }

        const outputEvent : DebugProtocol.OutputEvent = new OutputEvent(typeText + ":  " + message, "console");
        outputEvent.body.source =
        {
            path: filename,
        };
        outputEvent.body.line = line;
        outputEvent.body.data =
        {
            type: typeText,
            timestamp: elapsedSeconds,
            source: filename,
            line: line,
            category: category,
            functionName: functionName,
            message: message
        };

        console.log(messageHeader + " " + elapsedSeconds + "s " + typeText + ": " + message);

        this.session?.sendEvent(outputEvent);
    }

    public async initialize() : Promise<void>
    {
        Log.trace("ServiceDebugMessages.initialize", []);

        const outputGroupEvent : DebugProtocol.OutputEvent = new OutputEvent("QmlDebug Ouput", "console");
        outputGroupEvent.body.group = "start";
        this.session?.sendEvent(outputGroupEvent);
    }

    public async deinitialize() : Promise<void>
    {
        Log.trace("ServiceDebugMessages.deinitialize", []);

        const outputGroupEvent : DebugProtocol.OutputEvent = new OutputEvent("QmlDebug Ouput", "console");
        outputGroupEvent.body.group = "end";
        this.session?.sendEvent(outputGroupEvent);
    }

    public constructor(session : QmlDebugSession)
    {
        Log.trace("ServiceDebugMessages.constructor", [ session ]);

        this.session = session;
        this.session.packetManager.registerHandler("DebugMessages",
            (header, packet) : boolean =>
            {
                const servicePacket = packet.readSubPacket();
                this.packetReceived(servicePacket);

                return true;
            }
        );
    }
}
