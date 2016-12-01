#![feature(box_syntax)]
#![feature(proc_macro)]
#![feature(plugin)]
#![plugin(maud_macros)]
#![feature(field_init_shorthand)]

extern crate iron;
extern crate maud;
extern crate router;
extern crate persistent;
extern crate mount;
extern crate staticfile;
extern crate bodyparser;
extern crate serde;
extern crate serde_json;
//TODO: this app will be complete shit until you replace cask. Cask doesn't have transactions.
extern crate cask;

use std::fmt;
use std::fmt::Debug;
use std::path::Path;
use std::iter::FromIterator;
use std::sync::Mutex;
use std::sync::Arc;
use cask::Cask;
use std::str::FromStr;

#[derive(Debug, Clone)]
#[allow(non_snake_case)]
struct TimerConfig{ startingDate:f64, onTime:f64, offTime:f64, lightMode:bool }

fn timerconfig_to_json(v:&TimerConfig)-> serde_json::Value {
    use serde_json::value::*;
    use serde_json::value::Value::*;
    Object(Map::from_iter(vec![
        ("startingDate".into(), F64(v.startingDate)),
        ("onTime".into(), F64(v.onTime)),
        ("offTime".into(), F64(v.offTime)),
        ("lightMode".into(), Bool(v.lightMode))
    ].into_iter()))
}

fn get_number_from_serde_map(om:&serde_json::Map<String, serde_json::Value>, key:&str)-> Result<f64, String>{
    match om.get(key) {
        Some(&serde_json::value::Value::F64(v))=> Ok(v),
        Some(&serde_json::value::Value::U64(v))=> Ok(v as f64),
        Some(&serde_json::value::Value::I64(v))=> Ok(v as f64),
        Some(_)=>{ let mut ret = "key for ".to_string(); ret.push_str(key); ret.push_str(" is the wrong datatype"); Err(ret) },
        None=> { let mut ret = "missing ".to_string(); ret.push_str(key); Err(ret) }
    }
}
fn get_bool_from_serde_map(om:&serde_json::Map<String, serde_json::Value>, key:&str)-> Result<bool, String>{
    match om.get(key) {
        Some(&serde_json::value::Value::Bool(v))=> Ok(v),
        Some(_)=>{ let mut ret = "key for ".to_string(); ret.push_str(key); ret.push_str(" is the wrong datatype"); Err(ret) },
        None=> { let mut ret = "missing ".to_string(); ret.push_str(key); Err(ret) }
    }
}
fn get_string_from_serde_map(om:&serde_json::Map<String, serde_json::Value>, key:&str)-> Result<String, String>{
    match om.get(key) {
        Some(&serde_json::value::Value::String(ref v))=> Ok(v.clone()),
        Some(_)=>{ let mut ret = "key for ".to_string(); ret.push_str(key); ret.push_str(" is the wrong datatype"); Err(ret) },
        None=> { let mut ret = "missing ".to_string(); ret.push_str(key); Err(ret) }
    }
}

#[allow(non_snake_case)]
fn json_to_timerconfig(v:&serde_json::Value)-> Result<TimerConfig,String> {
    use serde_json::value::Value::*;
    if let Object(ref om) = *v {
        let startingDate = try!(get_number_from_serde_map(om, "startingDate"));
        let onTime = try!(get_number_from_serde_map(om, "onTime"));
        let offTime = try!(get_number_from_serde_map(om, "offTime"));
        let lightMode = try!(get_bool_from_serde_map(om, "lightMode"));
        Ok(TimerConfig{startingDate, onTime, offTime, lightMode})
    }else{
        Err("not an object".into())
    }
}

use iron::prelude::*;

#[derive(Debug)]
struct StringError(String);
impl fmt::Display for StringError {
    fn fmt(&self, f: &mut fmt::Formatter)-> fmt::Result {
        Debug::fmt(self, f)
    }
}
impl std::error::Error for StringError {
    fn description(&self) -> &str { &*self.0 }
}

fn reported_error(msg:String)-> IronError {
    println!("{}", msg);
    IronError::new(StringError(msg), iron::status::BadRequest)
}
fn jsonify_str(msg:String)-> String { serde_json::to_string(&serde_json::value::Value::String(msg)).unwrap() }
fn okay_response(msg:String)-> IronResult<Response> {
    Ok(Response::with((
        iron::status::Ok,
        msg
    )))
}


fn generate_index(config:&str)-> maud::Markup {
    // let configstr = serde_json::value::to_value(config).to_string();
    use maud::PreEscaped;
    html! {
        html {
            head {
                title "flow"
                link rel="shortcut icon" href="assets/minimalfavicon.png"
                link href="https://fonts.googleapis.com/css?family=Economica:400" rel="stylesheet" type="text/css"
                link href="https://fonts.googleapis.com/css?family=Roboto:400" rel="stylesheet" type="text/css"
                script type="text/javascript" {
                    "var config = " (PreEscaped(config)) ";"
                }
                // script type="text/javascript" src="assets/shiver.js" {}
                script type="text/javascript" src="assets/mainpage.js" {}
                link href="assets/mainpage.css" rel="stylesheet" type="text/css" {}
            }
            body {
                audio id="focusSound" class="defsOnly" src="assets/shimshamer.ogg" preload="auto" {}
                audio id="breakSound" class="defsOnly" src="assets/shimshamer.ogg" preload="auto" {}
                div id="mainContent" {
                    div id="clockArea" {
                        div id="clockLine" {
                            div id="clockFace" {
                                canvas id="clockCanvas" width="90" height="90" {}
                            }
                            div id="clockText" {}
                        }
                        div id="statusLine" class="rowHeading" {
                            "We are "
                            u span id="currentStatus" "focusing on the task"
                        }
                    }
                    div id="configurationArea" {
                        span { "settings" }
                        div id="setIntervalsInfo" class="infoLine" {
                            div class="intervalInput" {
                                "working"
                                input id="intervalOnTime" {}
                            }
                            div class="intervalInput" {
                                "resting"
                                input id="intervalOffTime" {}
                            }
                            button id="sendIntervalsBtn" { "set intervals" }
                        }
                        div { span id="resetBtn" class="action rowHeading" { "reset" } }
                        div id="shareInfo" class="infoLine" {
                            span id="shareBtn" class="action rowHeading" { "share" }
                            input id="shareLinkDisplay" readOnly="true" class="linkDisplay" {}
                        }
                        div id="aboutInfo" {
                            span { "about" }
                            p { "This is a pomodoro timer. The pomodoro method is a productivity technique. There is a cycle of work, and rest. During the work period you focus completely on the task you've committed yourself to, no distractions, not till the end. During the rest period, you step back, reflect, and think through what you're going to do in the next cycle." }
                            p { "People who work from home may find it beneficial to share a pomodoro timer with some of their friends, as it imbues the cycle with a sense of collective will. If everyone you're with is working, you're going to feel like working too. If everyone breaks at the same times, you will have people to talk to during your break." }
                            p { "Flow is a gift from " a href="http://aboutmako.makopool.com/" { "mako" } "." }
                        }
                    }
                }
                a href="http://aboutmako.makopool.com/" id="makersMark" {
                    div class="makerstext" "about" {}
                    svg class="defsOnly" xmlns="http://www.w3.org/2000/svg" width="512" height="512" {
                        path id="aboutLogo" d="m256 0-95.7 95.7 256 256L512 256 256 0zM95.7 160.3 0 256l256 256 95.7-95.7-256-256z" /
                    }
                    svg id="minimalIconView" viewBox="0 0 512 512" {
                        use xlink:href="#aboutLogo" /
                    }
                }
            }
        }
    }
}

fn get_mainpage(_: &mut Request)-> IronResult<Response> {
    Ok(Response::with((iron::status::Ok, generate_index(
        "{\"startingDate\":null, \"onTime\":1500, \"offTime\":300, \"lightMode\":false}"
    ))))
}

// fn get_page_for_key(key:&str)-> IronResult<Response> {
//     //TODO
// }



trait KeyEncoding{
    fn to_n(v:&str)-> Result<u64, String>;
    fn from_n(v:u64)-> String;
}
// let consonants = vec!["g", "j", "z", "s", "l", "t", "p", "m", "ny"];
// let vowels = vec!["a", "o", "ee", "ai", "ow", "yu"];
// struct WordEncoding;
// impl KeyEncoding for WordEncoding{
//     fn to_n(v:&str)-> Rresult<u64, String>{
//         let mut total = 0u64
//         let mut curs = v;
//         let scanFor = |s:&str, digits:&Vec<&str>|-> Result<(&str, usize), String> {
//             for (conso, i) in digits.iter().enumerate() {
//                 if v.starts_with(conso) {
//                     let (_, remaining) = v.split_at(conso.len());
//                     return Ok((remianing, i));
//                 }
//             }
//             Err("no matching digit fits here".into())
//         };
//         loop{
//             let mut consi;
//             (curs, consi) = try!(scanFor(curs, &consonants));
//             let mut vowely;
//             (curs, voweli) = try!(scanFor(curs, &vowels));
            
//         }
//     }
//     fn from_n(v:u64)-> String;
// }

struct DullEncoding;
impl KeyEncoding for DullEncoding{
    fn to_n(v:&str)-> Result<u64, String> {
        u64::from_str(v).map_err(|_| "couldn't parse key".to_string())
    }
    fn from_n(v:u64)-> String {
        v.to_string()
    }
}

type Encoding = DullEncoding;



fn get_cask_string(cask:&Cask, key:&str)-> Result<String, String> {
    match cask.get(key) {
        Some(v)=> {
            String::from_utf8(v).or_else( |_| Err("corrupted data".into()) )
        },
        None=> {
            Err("no such value".into())
        }
    }
}
fn parse_timer(v:&str)-> Result<TimerConfig, String> {
    match serde_json::from_str(v) {
        Ok(vv)=> json_to_timerconfig(&vv),
        Err(er)=> Err(er.to_string())
    }
}
fn timerconfig_to_str(v:&TimerConfig)-> String {
    serde_json::to_string(&timerconfig_to_json(v)).unwrap()
}
fn db_key_from_id(id:u64)-> String {
    let mut ret = String::with_capacity(16);
    ret.push_str("timer_");
    ret.push_str(&id.to_string());
    ret
}


fn fresh_id(cask:&Cask, counter:&Mutex<u64>)-> u64 {
    let mut ccmg:std::sync::MutexGuard<u64> = counter.lock().unwrap();
    let cc = *ccmg;
    let nc = cc+1;
    *ccmg = nc;
    cask.put("next_timer_id", nc.to_string());
    cc
}

fn create_timer(cask:&Cask, counter:&Mutex<u64>, conf:&TimerConfig)-> u64 {
    let id = fresh_id(cask, counter);
    cask.put(db_key_from_id(id), serde_json::to_string(&timerconfig_to_json(conf)).unwrap().as_bytes());
    id
}
fn edit_timer(cask:&Cask, key:u64, conf:&TimerConfig){
    cask.put(db_key_from_id(key), serde_json::to_string(&timerconfig_to_json(conf)).unwrap().as_bytes());
}
fn get_timer(cask:&Cask, key:&str)-> Result<TimerConfig, String> {
    get_cask_string(cask, key).and_then(|s| parse_timer(&s))
}

struct CaskKey;
impl iron::typemap::Key for CaskKey { type Value = Cask; }
struct KeyGenerationCounter;
impl iron::typemap::Key for KeyGenerationCounter { type Value = u64; }


fn receive_query(r: &mut Request)-> IronResult<Response> {
    let cask:Arc<Cask> = r.get::<persistent::Read<CaskKey>>().unwrap();
    let countermut:Arc<Mutex<u64>> = r.get::<persistent::Write<KeyGenerationCounter>>().unwrap();
    let body = r.get::<bodyparser::Json>();
    use serde_json::value::*;
    use serde_json::value::Value::*;
    match body {
        Ok(Some(ref ot))=> {
            match ot{
                &Object(ref om)=> {
                    if let Some(&String(ref opname)) = om.get("op") {
                        let make_missing_key_error = ||{ reported_error("missing key".into()) };
                        let get_config = |om:&Map<std::string::String,Value>|-> IronResult<TimerConfig> {
                            om.get("config")
                                .ok_or_else(make_missing_key_error)
                                .and_then(|v:&Value|{
                                    json_to_timerconfig(v).or_else(
                                        |v:std::string::String|
                                            Err(reported_error(v))
                                    )
                                })
                        };
                        if opname == "create" {
                            let conf:TimerConfig = try!(get_config(om));
                            let new_key = create_timer(&cask, &countermut, &conf);
                            okay_response(jsonify_str(Encoding::from_n(new_key)))
                        } else if opname == "edit" {
                            let id = Encoding::to_n(
                                &try!(
                                    get_string_from_serde_map(om, "key")
                                        .or_else(|s| Err(reported_error(s)))
                                )
                            ).unwrap();
                            let conf:TimerConfig = try!(get_config(om));
                            edit_timer(&cask, id, &conf);
                            okay_response(jsonify_str("successful".into()))
                        } else {
                            Err(reported_error("invalid op".into()))
                        }
                    }else{
                        Err(reported_error("invalid op".into()))
                    }
                }
                _=> Err(reported_error("invalid op".into()))
            }
        }
        Ok(None)=> Err(reported_error("no body".into())),
        Err(err)=> Err(reported_error(err.to_string())),
    }
}

fn get_timer_page(r: &mut Request)-> IronResult<Response> {
    use router::Router;
    let cask:Arc<Cask> = r.get::<persistent::Read<CaskKey>>().unwrap();
    let timerkey:&str = r.extensions.get::<Router>().unwrap().find("timer_id").unwrap();
    let tid:u64 = try!(Encoding::to_n(timerkey).map_err(|es| reported_error(es)));
    
    
    match get_timer(&cask, &db_key_from_id(tid)) {
        Ok(tc)=>
            Ok(Response::with((iron::status::Ok, generate_index(
                &timerconfig_to_str(&tc),
            )))),
        Err(es)=> Err(reported_error(es))
    }
}

fn main() {
    use staticfile::Static;
    use mount::Mount;
    use router::Router;
    
    let cask = Cask::open("cask.db", false);
    let initial_count_value:u64 = match get_cask_string(&cask, "next_timer_id") {
        Ok(nids)=> u64::from_str(&nids).unwrap(),
        Err(_) => 0
    };
    
    let mut query_chain = Chain::new(receive_query);
    const LIMIT:usize = 1024*1024*6;
    query_chain.link_before(persistent::Read::<bodyparser::MaxBodyLength>::one(LIMIT));
    let mut mount = Mount::new();
    let mut router = Router::new();
    router.post("/q/q", query_chain, "receive query");
    router.get("/", get_mainpage, "main page");
    router.get("/:timer_id", get_timer_page, "specific timer");
    mount.mount("/", router);
    mount.mount("/assets/", Static::new(Path::new("../../front/assets/")));
    
    let mut main_chain = Chain::new(mount);
    main_chain.link_before(persistent::Write::<KeyGenerationCounter>::one(initial_count_value));
    main_chain.link_before(persistent::Read::<CaskKey>::one(cask));
    
    println!("starting server");
    Iron::new(main_chain).http("localhost:3200").unwrap();
}