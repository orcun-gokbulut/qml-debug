export class Packet
{
    private size : number = 0;
    private data = Buffer.alloc(0);
    private readOffset : number = 0;

    public setData(data : Buffer, size? : number, offset? : number)
    {
        if (size !== undefined && offset !== undefined)
        {
            this.data = data.slice(offset, offset + size);
            this.size = size;
        }
        else if (size !== undefined)
        {
            this.data = data.slice(0, size);
            this.size = size;
        }
        else
        {
            this.data = data;
            this.size = data.length;
        }

        this.readOffset = 0;
    }

    public getData() : Buffer
    {
        return this.data.slice(0, this.size);
    }

    public getSize() : number
    {
        return this.size;
    }

    private resize(size : number)
    {
        this.size = size;
        if (this.size > this.data.length)
        {
            const exponent = Math.floor(Math.log2(this.size)) + 1;
            const newSize = Math.pow(2, exponent);

            const newBuffer = Buffer.alloc(newSize);
            this.data.copy(newBuffer);

            this.data = newBuffer;
        }
    }

    private expand(size : number)
    {
        this.resize(this.size + size);
    }

    public readSeek(offset : number) : void
    {
        if (offset > this.size)
            this.readOffset = this.size;
        else if (offset < 0)
            this.readOffset = 0;
        else
            this.readOffset = Math.floor(offset);
    }

    public readEOF() : boolean
    {
        return this.readOffset >= this.readOffset;
    }

    public readTell() : number
    {
        return this.readOffset;
    }

    public readUInt8() : number
    {
        const value = this.data.readUInt8(this.readOffset);
        this.readOffset += 1;
        return value;
    }

    public readUInt16LE() : number
    {
        const value = this.data.readUInt16LE(this.readOffset);
        this.readOffset += 2;
        return value;
    }

    public readUInt16BE() : number
    {
        const value = this.data.readUInt16BE(this.readOffset);
        this.readOffset += 2;
        return value;
    }

    public readUInt32LE() : number
    {
        const value = this.data.readUInt32LE(this.readOffset);
        this.readOffset += 4;
        return value;
    }

    public readUInt32BE() : number
    {
        const value = this.data.readUInt32BE(this.readOffset);
        this.readOffset += 4;
        return value;
    }

    public readUInt64LE() : bigint
    {
        const value = this.data.readBigInt64LE(this.readOffset);
        this.readOffset += 8;
        return value;
    }

    public readUInt64BE() : bigint
    {
        const value = this.data.readBigInt64BE(this.readOffset);
        this.readOffset += 8;
        return value;
    }

    public readInt8() : number
    {
        const value = this.data.readInt8(this.readOffset);
        this.readOffset += 1;
        return value;
    }

    public readInt16LE() : number
    {
        const value = this.data.readInt16LE(this.readOffset);
        this.readOffset += 2;
        return value;
    }

    public readInt16BE() : number
    {
        const value = this.data.readInt16BE(this.readOffset);
        this.readOffset += 2;
        return value;
    }

    public readInt32LE() : number
    {
        const value = this.data.readInt32LE(this.readOffset);
        this.readOffset += 4;
        return value;
    }

    public readInt32BE() : number
    {
        const value = this.data.readInt32BE(this.readOffset);
        this.readOffset += 4;
        return value;
    }

    public readInt64LE() : bigint
    {
        const value = this.data.readBigInt64LE(this.readOffset);
        this.readOffset += 8;
        return value;
    }

    public readInt64BE() : bigint
    {
        const value = this.data.readBigInt64BE(this.readOffset);
        this.readOffset += 8;
        return value;
    }

    public readFloat() : number
    {
        const value = this.data.readFloatBE(this.readOffset);
        this.readOffset += 4;
        return value;
    }

    public readDouble() : number
    {
        const value = this.data.readDoubleBE(this.readOffset);
        this.readOffset += 8;
        return value;
    }

    public readBoolean() : boolean
    {
        const value = this.data.readUInt8(this.readOffset);
        this.readOffset += 8;
        return (value === 0 ? false : true);
    }

    public readStringUTF8() : string
    {
        const len = this.data.readUInt32BE(this.readOffset);
        this.readOffset += 4;

        if (len === 0xFFFFFFFF)
            return "";

        const value = this.data.toString("utf-8", this.readOffset, this.readOffset + len);
        this.readOffset += len;

        return value;
    }

    public readStringUTF16() : string
    {
        const len = this.data.readUInt32BE(this.readOffset);
        this.readOffset += 4;

        if (len === 0xFFFFFFFF)
            return "";

        const valueBuffer = this.data.slice(this.readOffset, this.readOffset + len);
        const valueString = valueBuffer.swap16().toString("ucs-2");
        this.readOffset += len;

        return valueString;
    }

    public readArray<ValueType>(readerFn : () => ValueType) : ValueType[]
    {
        let value : ValueType[] = [];

        const count = this.data.readUInt32BE(this.readOffset);
        this.readOffset += 4;

        for (let i = 0; i < count; i++)
            value[i] = readerFn.call(this);

        return value;
    }

    public readJsonUTF8() : any
    {
        const jsonString = this.readStringUTF8();
        return JSON.parse(jsonString);
    }

    public readJsonUTF16() : any
    {
        const jsonString = this.readStringUTF16();
        return JSON.parse(jsonString);
    }

    public readSubPacket() : Packet
    {
        const size = this.readUInt32BE();
        const packet = new Packet(this.data.slice(this.readOffset, this.readOffset + size));
        this.readOffset += size;
        return packet;
    }

    public appendUInt8(value : number) : void
    {
        const offset = this.size;
        this.expand(1);
        this.data.writeUInt8(value, offset);
    }

    public appendUInt16LE(value : number) : void
    {
        const offset = this.size;
        this.expand(2);
        this.data.writeUInt16LE(value, offset);
    }

    public appendUInt16BE(value : number) : void
    {
        const offset = this.size;
        this.expand(2);
        this.data.writeUInt16BE(value, offset);
    }

    public appendUInt32LE(value : number) : void
    {
        const offset = this.size;
        this.expand(4);
        this.data.writeUInt32LE(value, offset);
    }

    public appendUInt32BE(value : number) : void
    {
        const offset = this.size;
        this.expand(4);
        this.data.writeUInt32BE(value, offset);
    }

    public appendUInt64LE(value : bigint) : void
    {
        const offset = this.size;
        this.expand(8);
        this.data.writeBigUInt64LE(value, offset);
    }

    public appendUInt64BE(value : bigint) : void
    {
        const offset = this.size;
        this.expand(8);
        this.data.writeBigUInt64BE(value, offset);
    }

    public appendInt8(value : number) : void
    {
        const offset = this.size;
        this.expand(1);
        this.data.writeInt8(value, offset);
    }

    public appendInt16LE(value : number) : void
    {
        const offset = this.size;
        this.expand(2);
        this.data.writeInt16LE(value, offset);
    }

    public appendInt16BE(value : number) : void
    {
        const offset = this.size;
        this.expand(2);
        this.data.writeInt16BE(value, offset);
    }

    public appendInt32LE(value : number) : void
    {
        const offset = this.size;
        this.expand(4);
        this.data.writeInt32LE(value, offset);
    }

    public appendInt32BE(value : number) : void
    {
        const offset = this.size;
        this.expand(4);
        this.data.writeInt32BE(value, offset);
    }

    public appendInt64LE(value : bigint) : void
    {
        const offset = this.size;
        this.expand(8);
        this.data.writeBigInt64LE(value, offset);
    }

    public appendInt64BE(value : bigint) : void
    {
        const offset = this.size;
        this.expand(8);
        this.data.writeBigInt64BE(value, offset);
    }

    public appendBoolean(value : boolean) : void
    {
        this.appendUInt8(value ? 1 : 0);
    }

    public appendFloat(value : number) : void
    {
        const offset = this.size;
        this.expand(8);
        this.data.writeFloatBE(value, offset);
    }

    public appendDouble(value : number) : void
    {
        const offset = this.size;
        this.expand(8);
        this.data.writeDoubleBE(value, offset);
    }

    public appendStringUTF8(value : string) : void
    {
        const offset = this.size;
        this.expand(4 + value.length);
        this.data.writeUInt32BE(value.length, offset);
        this.data.write(value, offset + 4);
    }

    public appendStringUTF16(value : string) : void
    {
        const offset = this.size;
        this.expand(4 + value.length * 2);
        this.data.writeUInt32BE(value.length * 2, offset);
        const stringBuffer = Buffer.from(value, "ucs-2").swap16();
        stringBuffer.copy(this.data, offset + 4);
    }

    public appendArray<ValueType>(appendFunction : (value : ValueType) => void, value : ValueType[])
    {
        this.appendUInt32BE(value.length);
        for (let i = 0; i < value.length; i++)
            appendFunction.call(this, value[i]);
    }

    public appendJsonUTF8(value : any) : void
    {
        const jsonString = JSON.stringify(value);
        this.appendStringUTF8(jsonString);
    }

    public appendJsonUTF16(value : any) : void
    {
        const jsonString = JSON.stringify(value);
        this.appendStringUTF16(jsonString);
    }

    public appendSubPacket(packet : Packet) : void
    {
        this.appendUInt32BE(packet.getSize());
        const offset = this.size;
        this.expand(packet.getSize());
        packet.getData().copy(this.data, offset);
    }

    public combine(packet : Packet)
    {
        const offset = this.size;
        this.expand(packet.getSize());
        packet.getData().copy(this.data, offset);
    }

    constructor(data? : Buffer, size? : number, offset? : number)
    {
        if (data !== undefined)
            this.setData(data, size, offset);
    }
};
