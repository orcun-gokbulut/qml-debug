import colors from "colors/safe";

export function toHexString(buffer : Buffer, rowSize = 20) : string
{
    let output = "";
    for (let y = 0; y < buffer.length / rowSize; y++)
    {
        const offset = y * rowSize;
        const offsetUpper = Math.floor(offset / 256)
        const offsetLower = offset - offsetUpper
        output += offsetUpper.toString(8).padStart(4, '0') + ":" + offsetLower.toString(16).padStart(4, '0') + " ";

        for (let x = 0; x < rowSize; x++)
        {
            const index = y * rowSize + x;
            let value = buffer.at(index) as number;

            if (index < buffer.length)
                output += " " + value.toString(16).toUpperCase().padStart(2, '0');
            else
                output += "   ";

            if (x % 4 == 3)
                output += " ";
        }

        output += " "
        for (let x = 0; x < rowSize; x++)
        {
            const index = y * rowSize + x;
            if (index >= buffer.length)
                return output;

            let value = buffer.at(index) as number;
            if (value < 32 || value == 127)
                output += colors.dim("·"); // DOT
            else
                output += String.fromCharCode(value);

            if (x % 4 == 3)
                output += " ";
        }

        output += "\n";
    }

    return output;
}
