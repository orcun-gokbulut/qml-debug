import Log  from './log';
import Packet  from './packet';
import PacketManager from './packet-manager';

interface QmlEngine
{
    name : string;
    debugId : number;
};

interface AwaitingRequest
{
    seqId : number;
    resolve: any;
    reject: any;
    timerId : NodeJS.Timeout;
};

export default class ServiceQmlDebugger
{
    private seqId = 0;
    private packetManager? : PacketManager;
    public awaitingRequests : AwaitingRequest[] = [];

    public packetReceived(packet : Packet)
    {
        Log.trace("QmlDebugger.packetReceived", [ packet ]);

        const operation = packet.readStringUTF8();
        const seqId = packet.readInt32BE();

        for (let i = 0; i < this.awaitingRequests.length; i++)
        {
            const current = this.awaitingRequests[i];
            if (current.seqId === seqId)
            {
                this.awaitingRequests = this.awaitingRequests.splice(i, 1);
                clearTimeout(current.timerId);
                current.resolve(packet);
                return;
            }
        }

        Log.error("Packet with wrong sequence id received. Sequence Id: " + seqId + ", " + operation +  "Operation: ");
    }

    private nextSeqId() : number
    {
        this.seqId++;
        return this.seqId;
    }

    private makeRequest(operation : string, data? : Packet) : Promise<Packet>
    {
        Log.trace("QmlDebugger.makeRequest", [ operation, data ]);

        return new Promise<Packet>(
            (resolve, reject) =>
            {
                const seqId = this.nextSeqId();
                const packet = new Packet();
                packet.appendStringUTF8(operation);
                packet.appendUInt32BE(seqId);
                if (data !== undefined)
                    packet.combine(data);

                    const envelopPacket = new Packet();
                envelopPacket.appendStringUTF16("QmlDebugger");
                envelopPacket.appendSubPacket(packet);

                const timerId = setTimeout(
                    () =>
                    {
                        reject(new Error("Request timed out. Sequence Id: " + seqId));
                    },
                    10000
                );

                this.awaitingRequests.push(
                    {
                        seqId: seqId,
                        resolve: resolve,
                        reject: reject,
                        timerId: timerId
                    }
                );

                this.packetManager!.writePacket(envelopPacket);
            }
        );
    }

    public async requestListEngines() : Promise<QmlEngine[]>
    {
        Log.trace("QmlDebugger.requestListEngines", []);

        const packet = await this.makeRequest("LIST_ENGINES");

        const count = packet.readUInt32BE();
        const engines : QmlEngine[] = [];
        for (let i = 0; i < count; i++)
        {
            const name = packet.readStringUTF8();
            const id = packet.readUInt32BE();
            engines.push(
                {
                    name: name,
                    debugId: id
                }
            );
        }

        return engines;
    }

    public constructor(packetManager : PacketManager)
    {
        Log.trace("QmlDebugger.initialize", [ packetManager ]);

        this.packetManager = packetManager;
        this.packetManager.registerHandler("QmlDebugger",
            (header, packet) : boolean =>
            {
                const qmlDebuggerPacket = packet.readSubPacket();
                this.packetReceived(qmlDebuggerPacket);

                return true;
            }
        );
    }
};
