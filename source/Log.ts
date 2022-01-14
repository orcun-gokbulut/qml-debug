import colors from 'colors/safe';

export enum LogLevel
{
    Debug,
    Trace,
    Info,
    Warning,
    Error,
    CriticalError,
    Success,
};

export class Log
{
    private static instance_ = new Log();

    public enabled = true;
    public level = LogLevel.Info;

    private className(depth = 4)
    {
        const error = new Error();

        if (error.stack != null)
            return ((error.stack).split("at ")[4]).trim().split(" (")[0];
        else
            return "";
    }

    private log(level : LogLevel, text : string, sender? : string)
    {
        if (!this.enabled && level < this.level)
            return;

        this.logConsole((sender != undefined ? sender : this.className()), level, text);
    }

    public logConsole(fn : string, level : LogLevel, text : string)
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

    public static debug(closure : string | (() => string))
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.Trace)
            return;

        if (typeof closure == "function")
            log.log(LogLevel.Debug, closure());
        else
            log.log(LogLevel.Debug, closure);
    }

    public static trace(fn : string, args : any)
    {
        const log = Log.instance();
        if (!log.enabled || log.level > LogLevel.Trace)
            return;

        let traceText = "";
        for (let i = 0; i < args.length; i++)
        {
            const current = args[i];
            if (typeof current == "undefined")
            {
                traceText += " ";
            }
            else if (typeof current == "number")
            {
                traceText += "" + (current as number);
            }
            else if (typeof current == "bigint")
            {
                traceText += "" + (current as bigint);
            }
            else if (typeof current == "string")
            {
                traceText += "\"" + (current as string) + "\"";
            }
            else if (typeof current == "boolean")
            {
                traceText += (current === false ? "false" : "true");
            }
            else if (typeof current == "function")
            {
                traceText += ("func()");
            }
            else if (typeof current == "object")
            {
                if (current == null)
                    traceText += "null";
            }

            if (i != args.length - 1)
                traceText += ", ";
        }

        Log.instance().log(LogLevel.Trace, fn + "(" + traceText + ")");
    }

    public static info(text : string)
    {
        Log.instance().log(LogLevel.Info, text);
    }

    public static warning(text : string)
    {
        Log.instance().log(LogLevel.Warning, text);
    }

    public static error(text : string)
    {
        Log.instance().log(LogLevel.Error, text);
    }

    public static critical(text : string)
    {
        Log.instance().log(LogLevel.CriticalError, text);
    }

    public static success(text : string)
    {
        Log.instance().log(LogLevel.Success, text);
    }

    public static instance() : Log
    {
        return this.instance_;
    }
};
