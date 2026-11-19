using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Xunit;

namespace FormulaD.Mes.Api.Tests;

/// <summary>T-102: логи не раскрывают строку подключения, пароль, имя пользователя БД.</summary>
public sealed class LoggingSecurityTests
{
    [Fact]
    public async Task Startup_Logs_Do_Not_Contain_Connection_String_Secrets()
    {
        var sink = new CapturingLogProvider();
        using var factory = new SqlConfiguredFactory()
            .WithWebHostBuilder(b => b.ConfigureLogging(l => l.AddProvider(sink)));

        await factory.CreateClient().GetAsync("/api/v1/info");

        var logs = sink.GetLogs();
        // Секреты, которые НИКОГДА не должны попасть в лог:
        string[] forbidden = ["Password=", "mes_reader", "mes_writer", "FormulaD_TEST", "mes-test-sql"];
        foreach (var secret in forbidden)
        {
            Assert.DoesNotContain(logs, m => m.Contains(secret, StringComparison.OrdinalIgnoreCase));
        }
    }

    private sealed class CapturingLogProvider : ILoggerProvider
    {
        private readonly List<string> _messages = [];
        private readonly Lock _lock = new();

        public ILogger CreateLogger(string categoryName) => new Logger(this);
        public void Dispose() { }

        public IReadOnlyList<string> GetLogs() { lock (_lock) return [.. _messages]; }

        private sealed class Logger(CapturingLogProvider owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel level) => true;

            public void Log<TState>(LogLevel level, EventId id, TState state, Exception? ex, Func<TState, Exception?, string> formatter)
            {
                var msg = formatter(state, ex);
                if (ex != null) msg += " " + ex.ToString();
                lock (owner._lock) owner._messages.Add(msg);
            }
        }
    }
}
