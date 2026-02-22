use std::error::Error;

pub type StringBuilder = String;

pub trait UrlRewriter: Send + Sync {
    fn rewrite(
        &self,
        cfg: &Config,
        flags: &Flags,
        url: &str,
        builder: &mut StringBuilder,
        module: bool,
    ) -> Result<(), Box<dyn Error + Sync + Send>>;
}

#[derive(Debug, Clone)]
pub struct Config {
    pub prefix: String,
    pub wrapfn: String,
    pub wrappropertybase: String,
    pub wrappropertyfn: String,
    pub cleanrestfn: String,
    pub importfn: String,
    pub rewritefn: String,
    pub setrealmfn: String,
    pub metafn: String,
    pub pushsourcemapfn: String,
    pub trysetfn: String,
    pub templocid: String,
    pub tempunusedid: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            prefix: "/webrascal/".into(),
            wrapfn: "$webrascal$wrap".into(),
            wrappropertybase: "$webrascal__".into(),
            wrappropertyfn: "$webrascal$prop".into(),
            cleanrestfn: "$webrascal$clean".into(),
            importfn: "$webrascal$import".into(),
            rewritefn: "$webrascal$rewrite".into(),
            setrealmfn: "$webrascal$setrealm".into(),
            metafn: "$webrascal$meta".into(),
            pushsourcemapfn: "$webrascal$pushsourcemap".into(),
            trysetfn: "$webrascal$tryset".into(),
            templocid: "$webrascal$temploc".into(),
            tempunusedid: "$webrascal$tempunused".into(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Flags {
    pub base: String,
    pub sourcetag: String,
    pub is_module: bool,
    pub capture_errors: bool,
    pub rascalitize: bool,
    pub do_sourcemaps: bool,
    pub strict_rewrites: bool,
    pub destructure_rewrites: bool,
}

impl Default for Flags {
    fn default() -> Self {
        Self {
            base: "about:blank".into(),
            sourcetag: "default".into(),
            is_module: false,
            capture_errors: false,
            rascalitize: false,
            do_sourcemaps: true,
            strict_rewrites: true,
            destructure_rewrites: true,
        }
    }
}