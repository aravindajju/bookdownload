var request = require('request');
var cheerio = require('cheerio');
var url = require('url');
var sprintf = require("sprintf-js").sprintf;
var fs = require('fs');
var exec = require('child_process').exec,child;
var path = require('path');
var async = require('async');
var readline = require('readline'),
    stream = require('stream');

/**
*read the book list from the text file of ids 
*/
var readbooklist = function(numbooks) {
 
  var bookidsfile='./bookids.csv'
  var linecount =numbooks;

  var instream = fs.createReadStream(bookidsfile);
  var outstream = new stream;
  outstream.readable = true;
  outstream.writable = true;

  var rl = readline.createInterface({
      input: instream,
      output: outstream,
      terminal: false
  });

  var bqueue=[];
  rl.on('line', function(line) {

	console.log('Book codes to download ' + line);
	// get the book metadata and download the book and generate pdf
	//getBookMetadata(line);
	var getBookFunction = getBookMetadataWrapper(line);
	bqueue.push(
		getBookFunction	
		//downloadrequest(rq,pagenumber,pdfdir,filename)
		//function(){rq.get(pagenumber).pipe(fs.createWriteStream(pdfdir + '/'+filename))}
	);      
	//console.log (linecount);
	if (--linecount<=0){
	console.log (linecount);
	rl.close();
	rl.removeAllListeners('line');
		instream.destroy();
	}

  });


    rl.on('close', function(line) {

		console.log('calling download function');

		async.series(bqueue,function(err, results) {
			console.log(results);
			if(err!=null){
			console.log(err);
			}
		});

    });

};


/**
* Wrap the function with a call back, so that it can be used with Async
*/
function getBookMetadataWrapper(barCode){
	return function(callback) {
		console.log('download ' + barCode);
		getBookMetadata(barCode, callback);		
	};
}


/**
* Request the metadata and then proceed to download the actual book
*/
function getBookMetadata(barCode,callback)
{

	var booktitle;
	var booklink;
	var	bookdata;

	var r = request.defaults({});
	//var r = request.defaults({'proxy':'http://aravinda:1Lall!ajju@proxy2.wipro.com:8080'});
	r.get('http://www.dli.gov.in/cgi-bin/metainfo.cgi?&barcode=' + barCode, function (error, response, body) {
	  if (!error && response.statusCode == 200) {
		//console.log(body) // Print the google web page.
		$ = cheerio.load(body);
		var nextmarker=false;
		$('td').map(function (i,el){
			if (nextmarker){
				booktitle=$(this).text().trim();
				//console.log(booktitle);
				nextmarker=false;
			}
			//console.log("element text" + $(this).text());
			if($(this).text().trim()=='Title'){
				nextmarker=true;
			}
		});
		$('a').map(function (i,el){

			if (i==0){
				booklink = 'http://www.dli.gov.in' + $(this).attr('href');
				//console.log(booklink);
			}
		});

		var queryparams = url.parse(booklink,true);
		//prepare the book data json
		bookdata = {'barcode':barCode ,'booktitle': booktitle,'booklink': booklink, 'pages':queryparams.query.last, 
		'pagelink': 'http://www.dli.gov.in' + queryparams.query.path1};
		console.log(bookdata);
		downloadBook(bookdata,callback);

	  }

	});
}

/**
* Wrap the download with a call back, so that it can be used with Async
*/
function downloadrequest(rq,pagenumber,pdfdir,filename){
	return function(callback2) {
		console.log('download ' + pagenumber);
		var ws = fs.createWriteStream(pdfdir + '/'+filename);
		ws.on('error', function(err) { console.log(err); });
		request(pagenumber).pipe(ws);
		ws.on('finish',function(){
			//rq.get(pagenumber).pipe(fs.createWriteStream(pdfdir + '/'+filename));
			console.log('downloaded ' + pagenumber);
			callback2(null,filename);
		});
	};
}

/*
* Download the book page by page
*/
function downloadBook(bookmetadata,callback){
	//console.log(bookmetadata);
	//http://www.dli.gov.in/data6/upload/0159/818/PTIFF/00000002.tif
	var rq = request.defaults({});
	//var rq = request.defaults({'proxy':'http://aravinda:1Lall!ajju@proxy2.wipro.com:8080'});
	var directoryname= bookmetadata.booktitle;
	var cleandir=directoryname.replace(/[|&;'$%@"<>()+,]/g, "");
	var pdfdir = './'+cleandir+'-'+bookmetadata.barcode;////'d:/temp/'+cleandir;


	//var q = async.queue(function (task, callback) {
    //	console.log('Task added ' + task.name);
    //	task.work();
    //	callback();
	//}, 5);

	var fqueue = [];


	for(var i=1;i<=bookmetadata.pages;i++){
		var pagenumber = bookmetadata.pagelink+'/PTIFF/'+generatePageNumber(i)+'.tif';
		var filename = generatePageNumber(i)+'.tif';
		//console.log('page numbers ' + bookmetadata.pagelink+'/PTIFF/'+generatePageNumber(i)+'.tif');

		fs.mkdir(pdfdir,function(e){
			if(!e || (e && e.code === 'EEXIST')){
				//do something with contents
			} else {
				//debug
			}
		});

		var downloadreqFunction = downloadrequest(rq,pagenumber,pdfdir,filename);
		fqueue.push(
			downloadreqFunction	
			//downloadrequest(rq,pagenumber,pdfdir,filename)
			//function(){rq.get(pagenumber).pipe(fs.createWriteStream(pdfdir + '/'+filename))}
		);
	
		//q.push({name:generatePageNumber(i),
		//	work:function(){rq.get(bookmetadata.pagelink+'/PTIFF/'+generatePageNumber(i)+'.tif').pipe(fs.createWriteStream(pdfdir + '/'+generatePageNumber(i)+'.tif'))}});
		
		/*
		r1.get(bookmetadata.pagelink+'/PTIFF/'+generatePageNumber(i)+'.tif', function (error, response, body) {
			var file = fs.createWriteStream('d:/temp/'+generatePageNumber(i)+'.tif');
			file.write(body);
			file.end();
			console.log('response handled' + response.statusCode);
		});
		*/
	}
	
	//Store the metadata as json file along with the book
	var wsbookdata = fs.createWriteStream(pdfdir + '/bookinfo.json');
	wsbookdata.write(JSON.stringify(bookmetadata));
	wsbookdata.end();

	console.log(fqueue.length);
	async.series(fqueue,function(err, results) {
		console.log(results);		
		callback(null,cleandir);
		generatePDF(bookmetadata, pdfdir, cleandir);
		if(err!=null){
			console.log(err);
		}
    // results is now equals to: {one: 1, two: 2}
	});
	//console.log("generate pdf");
	//q.drain = function() {
    //	console.log('all items have been processed');
	//}
	//
}			

function generatePageNumber(page){
	//console.log(sprintf("%08d",page));
	return sprintf("%08d",page);
}


function generatePDF(bookmetadata, pdfdir, cleandir){

  /* For listing the tifffiles for some commands in Windows - not needed for mac	
  var tifffiles='';
  for(var i=1;i<=bookmetadata.pages;i++){
	tifffiles += ' ' + generatePageNumber(i)+'.tif';
  }
  console.log('tifffiles ' + tifffiles);
  */
  console.log('pdfdir ' + pdfdir);	

  pdffullpath = path.resolve(process.cwd(),pdfdir);
  //var tif2pdfcmd = 'sips -s format pdf ' + pdfdir +'/*.tif --out '+ pdfdir;
  //console.log('tiff2pdfcmd ' + tif2pdfcmd);

  child = exec('cd \''+ pdffullpath +'\'' ,
  function (error, stdout, stderr) {	
    if (error == null) {
	  console.log('executing command ' + pdffullpath);		
	  child = exec('sips -s format pdf *.tif --out ./', {cwd: pdffullpath, maxBuffer: 100000*1024} ,function (error, stdout, stderr) {
	  //Command for windows	
	  //child = exec('d:/tools/libtiff.net_bin-2.3.641.0/tiffcp ' + tifffiles + ' ' + 'finalbook' +'.tif', {cwd: pdfdir} ,function (error, stdout, stderr) {
		if (error!=null){
			console.log('sips exec error: ' + error);
		}
		else {
			child = exec('pdftk *.pdf cat output \'' + cleandir + '.pdf\'', {cwd: pdfdir} ,function (error, stdout, stderr) {
				if(error!=null){
					console.log('pdftk exec error: ' + error);
				}

				else {
					child = exec('rm 0*.pdf 0*.tif', {cwd: pdfdir} ,function (error, stdout, stderr) {
						if(error!=null){
							console.log('exec error: ' + error);
						}
					});
				}
			});
		}	
	  });
    }  
    else {console.log(error);}
});

}

readbooklist(process.argv[2]);
//getBookMetadata('2020050016544');

