import * as colors from "colors/safe";


export enum LogLevel
{
    Debug,
    Trace,
    Detail,
    Info,
    Warning,
    Error,
    CriticalError,
    Success,
}

export default class Log
{
    private static instance_ = new Log();

    public enabled = true;
    public level = LogLevel.Info;

    private className(depth = 4)
    {
        const error = new Error();

        if (error.stack !== null)
            return ((error.stack!).split("at ")[4]).trim().split(" (")[0];
        else
            return "";
    }

    private log(level : LogLevel, text : string, sender? : string) : void
    {
        if (!this.enabled && level < this.level)
            return;

        this.logConsole((sender !== undefined ? sender : this.className()), level, text);
    }

    public logConsole(fn : string, level : LogLevel, text : string) : void
    {
        let output = colors.white("[" + fn + "] ");
        switch (level)
        {
            case LogLevel.Success:
                output += colors.green("Success");
                break;

            case LogLevel.CriticalError:
                output += colors.red("CRITICAL ERROR");
                break;

            case LogLevel.Error:
                output += colors.red("Error");
                break;

            case LogLevel.Warning:
                output += colors.yellow("Warning");
                break;

            default:
            case LogLevel.Info:
                output += colors.reset("Info");
                break;

            case LogLevel.Detail:
                output += colors.reset("Detail");
                break;

            case LogLevel.Trace:
                output += colors.reset("Trace");
                break;

            case LogLevel.Debug:
                output += colors.reset("Debug");
                break;
        }

        output += ": " + text;

        console.log(output);
    }

    public static debug(closure : string | (() => string)) : void
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.Debug)
            return;

        if (typeof closure === "function")
            log.log(LogLevel.Debug, closure());
        else
            log.log(LogLevel.Debug, closure);
    }

    public static trace(fn : string, args : any) : void
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.Trace)
            return;

        let traceText = "";
        for (let i = 0; i < args.length; i++)
        {
            const current = args[i];
            if (typeof current === "undefined")
            {
                traceText += " ";
            }
            else if (typeof current === "number")
            {
                traceText += "" + (current as number);
            }
            else if (typeof current === "bigint")
            {
                traceText += "" + (current as bigint);
            }
            else if (typeof current === "string")
            {
                traceText += "\"" + (current as string) + "\"";
            }
            else if (typeof current === "boolean")
            {
                traceText += (current === false ? "false" : "true");
            }
            else if (typeof current === "function")
            {
                traceText += ("function()");
            }
            else if (typeof current === "object")
            {
                if (current === null)
                    traceText += "null";
                else
                    traceText += "" + current;
            }
            else
            {
                traceText += "UNKNOWN";
            }

            if (i !== args.length - 1)
                traceText += ", ";
        }

        Log.instance().log(LogLevel.Trace, fn + "(" + traceText + ")");
    }

    public static detail(closure : string | (() => string)) : void
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.Detail)
            return;

        if (typeof closure === "function")
            log.log(LogLevel.Detail, closure());
        else
            log.log(LogLevel.Detail, closure);
    }

    public static info(text : string) : void
    {
        Log.instance().log(LogLevel.Info, text);
    }

    public static warning(text : string) : void
    {
        Log.instance().log(LogLevel.Warning, text);
    }

    public static error(text : string) : void
    {
        Log.instance().log(LogLevel.Error, text);
    }

    public static critical(text : string) : void
    {
        Log.instance().log(LogLevel.CriticalError, text);
    }

    public static success(text : string) : void
    {
        Log.instance().log(LogLevel.Success, text);
    }

    public static instance() : Log
    {
        return this.instance_;
    }
}
