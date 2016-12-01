export function sum(ar:Array<number>){return ar.reduce((a,b)=> a+b)}
export function product(ar:Array<number>){return ar.reduce((a,b)=> a*b)}

export function afterDOMContentLoaded(f:()=>void){ //runs even if the DOMContentLoaded event has already fired
	if(document.readyState == "complete" || document.readyState == "interactive"){
		f()
	}else{
		document.addEventListener("DOMContentLoaded", f)
	}
}

export function zip<A,B,C>(a:A[],b:B[], f:(A,B)=>C):C[]{
	var ret = []
	for(var i=0, max=Math.min(a.length,b.length); i<max; ++i){
		ret.push(f(a[i],b[i]))
	}
	return ret
}

// function joining<T>(arr:T[], on:(T)=>void, off:()=>void){
// 	if(arr.length == 0) return
// 	var i=0
// 	while(true){
// 		on(arr[i])
// 		++i
// 		if(i < arr.length){ off() }
// 	}
// }

export function awaitRequest(httpType:string, address:string, data, contentType?:string):Promise<any>{
	return new Promise((g,b)=> {
		var q = new XMLHttpRequest()
		q.open(httpType, address, true)
		if(contentType) q.setRequestHeader("Content-Type", contentType)
		q.onreadystatechange = (ev)=>{
			if(q.readyState == 4){
				if(q.status == 200){
					var o
					try{
						o = JSON.parse(q.responseText)
					}catch(e){
						b("the json that came through is malformed. "+e)
						return
					}
					g(o)
				}else{
					b("problem fetching json. status:" + q.status)
				}
			}
		}
		q.ontimeout = (ev)=>{
			b("query took too long. Network problem?")
		}
		q.send(data || null)
	})
}
export function postObjectGetObject(address:string, data):Promise<any>{
	return awaitRequest("POST", address, JSON.stringify(data), "application/json")
}
export function postDataGetObject(address:string, data):Promise<any>{
	return awaitRequest("POST", address, data)
}
export function fetchObject(address:string):Promise<any>{
	return awaitRequest("GET", address, null)
}

export function copyInObject(target:any, other:any){
	for(var k in other){
		target[k] = other[k]
	}
}
export function copyObject(v:any){
	var ret = {}
	copyInObject(ret, v)
	return ret
}
export function removeArrayItem(ar:any[], i:number){ //if i == -1, does nothing
	if(i >= 0){
		++i
		while(i < ar.length){
			ar[i-1] = ar[i]
			++i
		}
		ar.pop()
	}
}

export function outerHeight(el){ //including margin
	var cstyle = getComputedStyle(el)
	return el.offsetHeight + parseFloat(cstyle.marginLeft) + parseFloat(cstyle.marginRight)
}
export function outerWidth(el){ //including margin
	var cstyle = getComputedStyle(el)
	return el.offsetWidth + parseFloat(cstyle.marginTop) + parseFloat(cstyle.marginBottom)
}
export function outerTop(el){
	var cstyle = getComputedStyle(el)
	return el.offsetTop - parseFloat(cstyle.marginTop)
}
export function outerLeft(el){
	var cstyle = getComputedStyle(el)
	return el.offsetLeft - parseFloat(cstyle.marginLeft)
}


export class Rng {
	constructor(private seed:number = Math.floor(Math.random()*233280)) {}
	private next(min:number, max:number):number {
		max = max || 0
		min = min || 0
		this.seed = (this.seed * 9301 + 49297) % 233280
		var rnd = this.seed / 233281
		return min + rnd*(max - min)
	}
	public nextInt(min:number, max:number):number {
		return Math.floor(this.next(min, max))
	}
	public nextDouble():number {
		return this.next(0, 1)
	}
	public pick(collection:any[]):any {
		return collection[this.nextInt(0, collection.length - 1)]
	}
}