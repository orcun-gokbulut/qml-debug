import Log from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import PacketManager from '@qml-debug/packet-manager';

export default class ServiceDebugMessages
{
    private packetManager? : PacketManager;

    protected packetReceived(packet: Packet): void
    {
        Log.trace("ServiceDebugMessages.packetReceived", [ packet ]);

        const messageHeader = packet.readStringUTF8();
        const type = packet.readInt32BE();
        const message = packet.readStringUTF8();
        const filename = packet.readStringUTF8();
        const line = packet.readInt32BE();
        const functionName = packet.readStringUTF8();
        const category = packet.readStringUTF8();
        const elapsed = packet.readInt64BE();

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

        const seconds = Number(elapsed / BigInt(1000000000));
        if (false)
            console.log(messageHeader + " " + seconds + "s " + filename + ":" + functionName + ":" + line + " - " + typeText + " (" + category + "): " + message);
        else
            console.log(messageHeader + " " + seconds + "s " + typeText + ": " + message);
    }

    public async initialize() : Promise<void>
    {
        Log.trace("ServiceDebugMessages.initialize", []);
    }

    public async deinitialize() : Promise<void>
    {
        Log.trace("ServiceDebugMessages.deinitialize", []);
    }

    public constructor(packetManager : PacketManager)
    {
        Log.trace("ServiceDebugMessages.constructor", [ packetManager ]);

        this.packetManager = packetManager;
        this.packetManager.registerHandler("DebugMessages",
            (header, packet) : boolean =>
            {
                const servicePacket = packet.readSubPacket();
                this.packetReceived(servicePacket);

                return true;
            }
        );
    }
};
