import Log from '@qml-debug/log';
import Packet from '@qml-debug/packet';
import PacketManager from '@qml-debug/packet-manager';

export default class ServiceDebugMessages
{
    private packetManager? : PacketManager;

    public packetReceived(packet : Packet)
    {
        let messageHeader = packet.readStringUTF8();
        let type = packet.readInt32BE();
        let message = packet.readStringUTF8();
        let filename = packet.readStringUTF8();
        let line = packet.readInt32BE();
        let functionName = packet.readStringUTF8();
        let category = packet.readStringUTF8();
        let elapsed = packet.readInt64BE();

        let typeText = "";
        switch(type)
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

        let seconds = Number(elapsed / BigInt(1000000000));
        console.log(messageHeader + " " + seconds + "s " + filename + ":" + functionName + ":" + line + " - " + typeText + " (" + category + "): " + message);

        return true;
    }

    public constructor(packetManager : PacketManager)
    {
        this.packetManager = packetManager;
        packetManager.registerHandler("DebugMessages",
            (header, packet) : boolean =>
            {
                Log.trace("QDebugMessages.packetHandler", []);

                this.packetReceived(packet.readSubPacket());

                return true;
            }
        );
    }
};
