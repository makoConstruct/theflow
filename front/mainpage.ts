
import {afterDOMContentLoaded, zip, awaitRequest, postObjectGetObject, postDataGetObject, fetchObject, VerticallyCollapsingContainer, getLocalstorageObject, setLocalstorageObject} from './shiver'

import {Toasts} from './toasts'
var toasts = new Toasts()

//configuration
declare var config:{startingDate:number, onTime:number, offTime:number, lightMode:boolean} //startingDate will be null if the config is new


//constants
var apiUrl = '/q/q'
var clockLineThickness = 9
var innerCircleLineThickness = 9
var clockGaps = 9


//utilities
var loge = (message?: any, ...optionalParams: any[])=> console.error(message, ...optionalParams)
var logi = (message?: any, ...optionalParams: any[])=> console.info(message, ...optionalParams)
var log = (message?: any, ...optionalParams: any[])=> console.log(message, ...optionalParams)

function objectQuery(o):Promise<any> {
	return postObjectGetObject(apiUrl, o).then((o)=>{ if(o.error){ return Promise.reject(o.error) }else{ return o } })
}

declare var Notification:any

var requestAnimFrame =
	window.requestAnimationFrame       ||
	window.webkitRequestAnimationFrame ||
	function( callback ){
		window.setTimeout(callback, 1000 / 60)
	}

function getEl(name){ return document.getElementById(name) }

function leftPad(n:number, padChar:string, baseStr:string):string {
	var pd = ''
	while(pd.length + baseStr.length < n){
		pd += padChar
	}
	return pd + baseStr
}

function selectElementContents(el:HTMLElement){
    var range = document.createRange()
    range.selectNodeContents(el)
    var sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
}

class ModeTransitioner{
	public currentMode:string
	constructor(
		public modes:Map<string, any>, //the objs can have an enter lambda, am exit lambda, and transition lambdas
		initialMode:string
	){
		this.currentMode = initialMode
	}
	transition(nm:string){
		if(nm == this.currentMode) return
		if(this.currentMode && this.modes.get(this.currentMode).exit){
			this.modes.get(this.currentMode).exit()
		}
		var enteredMode = this.modes.get(nm)
		if(enteredMode.enter) enteredMode.enter()
		if(enteredMode.enterFrom){
			if(enteredMode.enterFrom[this.currentMode]){
				enteredMode.enterFrom[this.currentMode]()
			}
		}
		this.currentMode = nm
	}
}

var clampUnit = (n:number)=> Math.min(1, Math.max(0, n))
var non = (n:number)=> 1-n
var lerp = (a:number, b:number, p:number)=> non(p)*a + p*b
var unlerp = (a:number, b:number, p:number)=> (p-a)/(b-a)
var sq = (n:number)=> n*n
var easeIn = (n:number)=> non(sq(non(n)))
var easeOut = (n:number)=> sq(sq(n))
var lightMode:boolean
var progressOverInterval = (startTime, transitionDuration)=> (Date.now() - startTime)/transitionDuration

// class TransitioningColor{
// 	public cachedStrTime:number
// 	public cachedStr:string
// 	public startTime:number
// 	public transitionDuration:number = 250
// 	constructor(public ca:Array<number>, public cb:Array<number>){
// 		this.transitionDuration = Date.now()
// 	}
// 	jump = (ncb:Array<number>)=>{
// 		this.cb = ncb
// 		this.startTime = Date.now() - this.transitionDuration
// 	}
// 	p = ():string=> {
// 		var pp:number = easeIn(clampUnit(progressOverInterval(this.startTime, this.transitionDuration)))
// 		if(pp == this.cachedStrTime){ return this.cachedStr }
// 		else{
// 			var ar = new Array(4)
// 			this.cachedStrTime = pp
// 			this.cachedStr = 'rgba('
// 			this.cachedStr += Math.round(lerp(this.ca[0], this.cb[0], pp)*256)
// 			this.cachedStr += ','
// 			this.cachedStr += Math.round(lerp(this.ca[1], this.cb[1], pp)*256)
// 			this.cachedStr += ','
// 			this.cachedStr += Math.round(lerp(this.ca[2], this.cb[2], pp)*256)
// 			this.cachedStr += ','
// 			this.cachedStr += Math.round(lerp(this.ca[3], this.cb[3], pp)*256)
// 			this.cachedStr += ')'
// 			return this.cachedStr
// 		}
// 	}
// }



//
var backgroundColor = ()=> lightMode ? '#ffffff' : '#000000'
var backgroundColorWithAlpha = (a)=> lightMode ?
	'rgba(255,255,255,'+a+')' :
	'rgba(0,0,0,'+a+')'
var arcColor = ()=> lightMode ? '#000' : '#e9e9e9'
var dimColor = ()=> lightMode ? '#CDCDCD' : '#1a1a1a'
var litColor = ()=> lightMode ? '#CDCDCD' : '#1a1a1a'
var circleColor = ()=> {
	return dimColor()
}

var urlFor = (key)=> 'http://'+document.location.hostname+'/'+key

var pageKey = ()=>{
	var pn = window.location.pathname.substring(1)
	return pn == "" ? null : pn
}
var isShared = ()=> !!pageKey()

function errorToast(msg:string){
	toasts.post(msg, {withClass:'no'})
}
function lastingErrorToast(msg:string){
	toasts.post(msg, {withClass:'no', lifespan:Infinity})
}
function toastNormally(msg:string){
	toasts.post(msg, {withClass:'alrightToast'})
}


function configurationChanged(){
	if(isShared()){
		objectQuery({op:'edit', key:pageKey(), config:config}).then(
			()=>{toastNormally("changes saved")},
			(err)=>{lastingErrorToast("error: "+err)} )
	}
}

function userIsPresent():boolean {
	return document.visibilityState == 'visible'
}

afterDOMContentLoaded(()=> {
	var clockFace = getEl('clockFace')
	var clockText = getEl('clockText')
	var currentStatus = getEl('currentStatus')
	var focusSound = getEl('focusSound') as HTMLAudioElement
	var breakSound = getEl('breakSound') as HTMLAudioElement
	var canvas = getEl('clockCanvas') as HTMLCanvasElement // in your HTML this element appears as <canvas id="mycanvas"></canvas>
	var setintervalsbtn = getEl('setintervalsBtn') as HTMLElement
	var cw = canvas.width
	var ch = canvas.height
	var cr = Math.min(cw,ch)/2
	var con = canvas.getContext('2d')
	
	//complete the config if it's fresh
	if(config.startingDate == null){
		config.startingDate = Date.now()
		configurationChanged()
	}
	
	//fetch settings from localstorage
	lightMode = getLocalstorageObject('dayMode', config.lightMode)
	var soundOn:boolean = getLocalstorageObject('soundEnabled', true)
	var userWantsNotifications:boolean = getLocalstorageObject('notificationsEnabled')
	
	//current rendering state
	var animations:Array<()=>boolean> = [] //if animation returns false, wont be called again
	var secondsIn:number
	var currentTimeRange:number = config.onTime
	var centerCirclep:number = 0
	var arcMin:number = 0
	var arcBound:number = 0
	var ticking //the intervalID
	
	//set up Notifications
	function updateNotificationSetting(ns:boolean){
		var currentNotificationSettingDisplay = getEl('currentNotifications')
		currentNotificationSettingDisplay.textContent = ns ? 'on' : 'off'
		userWantsNotifications = ns
		setLocalstorageObject('notificationsEnabled', userWantsNotifications)
		if(ns){
			if(Notification){
				if(Notification.permission == 'default'){
					Notification.requestPermission().then((result)=>{
						if(result == 'denied'){
							userWantsNotifications = false
						}else if(result == 'default'){
							userWantsNotifications = true
						}else{
							userWantsNotifications = true
						}
						setLocalstorageObject('notificationsEnabled', userWantsNotifications)
					})
				}else if(Notification.permission == 'denied'){
					errorToast("You must have told the web browser to forbid me from using notifications. I can't enable them. You will have to speak with it for me and sort things out.")
				}
			}else{
				errorToast("Your web browser does not support notifications. Maybe you should install a better web browser. How about chrome?")
			}
		}
	}
	updateNotificationSetting(userWantsNotifications)
	var notificationsBtn = getEl('notificationsBtn')
	notificationsBtn.addEventListener('click', ()=>{
		updateNotificationSetting(!userWantsNotifications)
	})
	
	//set up sound setting
	function updateSoundSetting(ns:boolean){
		soundOn = ns
		setLocalstorageObject('soundEnabled', soundOn)
		getEl('currentSound').textContent = ns ? 'on' : 'off'
	}
	updateSoundSetting(soundOn)
	getEl('soundBtn').addEventListener('click', ()=>{
		updateSoundSetting(!soundOn)
	})
	
	//set up theme setting
	function updateThemeSetting(ns:boolean){
		lightMode = ns
		setLocalstorageObject('dayMode', lightMode)
		getEl('currentTheme').textContent = lightMode ? 'light' : 'dark'
		if(lightMode){
			document.body.classList.add('lightTheme')
		}else{
			document.body.classList.remove('lightTheme')
		}
	}
	updateThemeSetting(lightMode)
	getEl('themeBtn').addEventListener('click', ()=>{
		updateThemeSetting(!lightMode)
	})
	
	
	function notify(msg, sound){
		if(Notification && userWantsNotifications){
			new Notification(msg, {icon:'arc.svg'})
		}else{
			console.log('notification: '+msg+' B)')
		}
		if(soundOn){
			sound.play()
		}
	}
	
	function renderf(){
		animations = animations.filter((anim)=> anim())
		con.clearRect(0,0,cw,ch)
		var p = secondsIn/currentTimeRange
		var endAngle
		var startAngle
		var outerAnticlockwise:boolean
		
		outerAnticlockwise = false
		startAngle = -Math.PI/2
		endAngle = startAngle + Math.PI*2*Math.min(Math.max(p, arcMin), arcBound)
		
		con.beginPath()
			con.arc(cw/2, ch/2, cr, startAngle, endAngle, outerAnticlockwise)
			con.arc(cw/2, ch/2, cr - clockLineThickness, endAngle, startAngle, !outerAnticlockwise)
		con.closePath()
		con.fillStyle = arcColor()
		con.fill()
		//inner circle
		con.beginPath()
			con.arc(cw/2, ch/2, cr - clockGaps - clockLineThickness, 0, Math.PI*2)
		con.closePath()
		con.fillStyle = circleColor()
		con.fill()
		//the hole in the circle
		if(centerCirclep){
			var outerm = cr - clockLineThickness - clockGaps - innerCircleLineThickness
			var innerm = outerm*0.7
			con.beginPath()
				con.arc(
					cw/2,
					ch/2,
					lerp(innerm, outerm, centerCirclep),
					0,
					Math.PI*2)
			con.closePath()
			con.fillStyle = backgroundColorWithAlpha(centerCirclep)
			con.fill()
		}
		if(animations.length){
			requestAnimFrame(renderf)
		}
	}
	function startRendering(){
		requestAnimFrame(renderf)
	}
	function addAnimation(anim){
		animations.push(anim)
		startRendering()
	}
	
	function easeArcDown(startTime:number){ return ()=> {
		arcMin = non(easeOut(progressOverInterval(startTime, 1200)))
		return arcMin > 0
	}}
	var mapModes:[string,any][] = [
		['noclock', {
			entry: ()=> {
				var startTime = Date.now()
				addAnimation(()=>{
					arcBound = easeOut(non(clampUnit(progressOverInterval(startTime, 230))))
					return arcBound > 0
				})
			},
			exit: ()=> {
				var startTime = Date.now()
				addAnimation(()=>{
					arcBound = easeOut(clampUnit(progressOverInterval(startTime, 450)))
					return arcBound < 1
				})
			}
		}],
		['focused', {
			exit: ()=>{
				addAnimation(easeArcDown(Date.now()))
			},
			enter: ()=>{
				currentTimeRange = config.onTime
				currentStatus.textContent = 'focusing on the task'
				var timeOfExit = Date.now()
				addAnimation(()=> {
					centerCirclep = non(clampUnit(progressOverInterval(timeOfExit, 90)))
					return centerCirclep > 0
				})
			},
			enterFrom: {
				'break': ()=>{
					// if(!userIsPresent()){ //this is no good. If the user uses a window manager, and the timer is visible in a workspace, even if that workspace isn't currently active, userIsPresent() will be, and no alert will ever sound.
					notify('now focus', focusSound)
					// }
				}
			}
		}],
		['break', {
			exit: ()=>{
				addAnimation(easeArcDown(Date.now()))
			},
			enter: ()=>{
				currentTimeRange = config.offTime
				currentStatus.textContent = 'taking a break'
				var timeOfEntry = Date.now()
				addAnimation(()=> {
					centerCirclep = clampUnit(progressOverInterval(timeOfEntry, 90))
					return centerCirclep < 1
				})
			},
			enterFrom: {
				'focused': ()=>{
					notify('step back. take a break', breakSound)
				}
			}
		}]
	]
	var mt:ModeTransitioner = new ModeTransitioner(new Map<string,any>(mapModes), 'noclock')
	
	function tick(){
		var totalSecondsIn = Math.floor((Date.now() - config.startingDate)/1000)%(config.onTime + config.offTime)
		if(totalSecondsIn < config.onTime){
			secondsIn = totalSecondsIn
			mt.transition('focused')
		}else{
			secondsIn = totalSecondsIn - config.onTime
			mt.transition('break')
		}
		
		var timeToGo = currentTimeRange - secondsIn
		var minutesToGo = Math.floor(timeToGo/60)
		clockText.textContent = leftPad(2, '0', ''+(minutesToGo))+":"+leftPad(2, '0', ''+(timeToGo%60))
		startRendering()
	}
	
	var openCount = 0
	function collapsionFor(v:HTMLElement):any {
		var ret = new VerticallyCollapsingContainer(v, 0.1, 0.1)
		var o = {
			isCollapsed: true,
			collapse: ()=>{
				if(openCount > 0){ --openCount }
				ret.collapse()
				o.isCollapsed = true
				if(openCount == 0){ getEl('configurationArea').classList.remove('active') }
			},
			expand: ()=>{
				if(openCount == 0){
					getEl('configurationArea').classList.add('active')
				}
				o.isCollapsed = false
				++openCount
				ret.expand()
			},
			toggle: ()=>{
				if(o.isCollapsed){
					o.expand()
				}else{
					o.collapse()
				}
			}
		}
		return o
	}
	
	var shareBtn = getEl('shareBtn') as HTMLElement
	var shareInfo = getEl('shareInfo') as HTMLElement
	var shareInfoCollapsion = collapsionFor(shareInfo)
	var shareLinkDisplay = getEl('shareLinkDisplay') as HTMLInputElement
	shareBtn.addEventListener('click', ()=>{
		if(!shareInfoCollapsion.isCollapsed){
			shareInfoCollapsion.collapse()
		}else{
			//trigger share if needed
			var displayLink = (key)=>{
				shareLinkDisplay.value = urlFor(key)
				shareInfoCollapsion.expand()
				shareLinkDisplay.select()
			}
			if(isShared()){
				displayLink(pageKey())
			}else{
				objectQuery({op:'create', config:config}).then(
					(o)=> {
						displayLink(o)
						toastNormally("configuration has been saved")
						history.pushState({op:'got_named'}, 'timer '+o, o)
					},
					loge
				)
			}
		}
	})
	shareLinkDisplay.addEventListener('click', ()=>{ shareLinkDisplay.select() })
	
	function startTicking(){
		tick()
		ticking = setInterval(tick, 1000)
	}
	
	var settingsInfo = getEl('settingsInfo') as HTMLElement
	var settingsBtn = getEl('settingsBtn') as HTMLElement
	var intervalOnTime = getEl('intervalOnTime') as HTMLInputElement
	var intervalOffTime = getEl('intervalOffTime') as HTMLInputElement
	var sendIntervalsBtn = getEl('sendIntervalsBtn') as HTMLElement
	var settingsInfoCollapsion = collapsionFor(settingsInfo)
	function transmitNewIntervals(){
		//for either mode, we figure out how far we are through the current interval of that mode and make us proportionately far through in the new settings
		if(intervalOnTime.classList.contains('no') || intervalOnTime.classList.contains('no')) return
		var newOnTime = Math.floor(parseFloat(intervalOnTime.value)*60)
		var newOffTime = Math.floor(parseFloat(intervalOffTime.value)*60)
		var newTimeRange
		if(mt.currentMode == 'break'){
			newTimeRange = newOffTime
		}else if(mt.currentMode == 'focused'){
			newTimeRange = newOnTime
		}else{
			console.error('why is there no clock. I\'m confused')
			newTimeRange = 0
		}
		secondsIn = lerp(0, newTimeRange, unlerp(0, currentTimeRange, secondsIn))
		currentTimeRange = newTimeRange
		var previousTimeRangesSeconds = mt.currentMode == 'focused' ? 0 : newOnTime
		config.startingDate = Date.now() - (previousTimeRangesSeconds + secondsIn)*1000
		config.onTime = newOnTime
		config.offTime = newOffTime
		configurationChanged()
	}
	
	settingsBtn.addEventListener('click', ()=>{ settingsInfoCollapsion.toggle() })
	
	sendIntervalsBtn.addEventListener('click', transmitNewIntervals)
	var prepToTakeMinutes = (htmlel)=>{
		htmlel.addEventListener('input', ()=>{
			if(parseFloat(htmlel.value) > 0){
				htmlel.classList.remove('no')
			}else{
				htmlel.classList.add('no')
			}
		})
		htmlel.addEventListener('click', ()=> htmlel.select())
	}
	prepToTakeMinutes(intervalOnTime)
	prepToTakeMinutes(intervalOffTime)
	
	intervalOnTime.value = ''+(config.onTime/60)
	intervalOffTime.value = ''+(config.offTime/60)
	
	
	
	var aboutAction = getEl('aboutBtn')
	var aboutInfoCollapsion = collapsionFor(getEl('aboutInfo'))
	aboutAction.addEventListener('click', ()=>{ aboutInfoCollapsion.toggle() })
	
	
	var resetBtn = getEl('resetBtn')
	function resetTime(){
		config.startingDate = Date.now()
		secondsIn = 0
		configurationChanged()
	}
	resetBtn.addEventListener('click', resetTime)
	
	
	function stopTicking(){
		if(ticking){
			clearInterval(ticking)
			ticking = null
		}
	}
	
	function reset(){
		config.startingDate = Date.now()
		stopTicking()
		startTicking()
		configurationChanged()
	}
	
	startTicking()
})
