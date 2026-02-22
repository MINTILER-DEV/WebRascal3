use clap::{Parser, Subcommand};
use native::{rewriter, test_runner};

#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    Rewrite {
        #[arg(long)]
        input: String,
        #[arg(long, default_value = "about:blank")]
        base: String,
        #[arg(long, default_value_t = false)]
        module: bool,
    },
    Test {
        #[arg(long, default_value = "tests")]
        dir: String,
    },
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Rewrite {
            input,
            base,
            module,
        } => {
            let text = std::fs::read_to_string(&input)?;
            let mut rw = rewriter::NativeRewriter::new();
            let out = rw.rewrite(text.as_bytes(), base, input, module)?;
            println!("{}", String::from_utf8_lossy(&out.js));
            eprintln!("errors: {}", out.errors.len());
        }
        Command::Test { dir } => {
            test_runner::run(&dir)?;
        }
    }
    Ok(())
}
